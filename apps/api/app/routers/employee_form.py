from datetime import date
from uuid import UUID
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.availability import AvailabilityType, EmployeeAvailability
from app.models.company import Company
from app.models.employee import Employee
from app.models.rules import EmployeeRule
from app.models.time_off import EmployeeTimeOff
from app.models.unavailability import EmployeeUnavailability
from app.schemas.availability import (
    AvailabilityBlockCreate,
    RuleUpsert,
    TimeOffCreate,
    UnavailabilityBlockCreate,
)
from app.services.validators import validate_time_range

from app.models.pto import EmployeePTO
from app.schemas.pto import PTOCreate

router = APIRouter()

# ✅ Point this to your repo’s mobile assets folder
MOBILE_LOGO_DIR = Path("/Users/nathanponder/Documents/otf_scheduler/apps/mobile/assets/logos")


def _require_employee(db: Session, employee_id: UUID) -> Employee:
    emp = db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


def _is_http_url(s: str) -> bool:
    s = (s or "").strip().lower()
    return s.startswith("http://") or s.startswith("https://")


def _read_local_logo_bytes(file_name: str) -> tuple[bytes, str]:
    safe_name = os.path.basename(file_name.strip())
    if not safe_name:
        raise HTTPException(status_code=404, detail="Company logo not set")

    path = (MOBILE_LOGO_DIR / safe_name).resolve()

    if not str(path).startswith(str(MOBILE_LOGO_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid logo filename")

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Logo file not found: {safe_name}")

    ext = path.suffix.lower()
    ct = "image/png"
    if ext in [".jpg", ".jpeg"]:
        ct = "image/jpeg"
    elif ext == ".webp":
        ct = "image/webp"
    elif ext == ".gif":
        ct = "image/gif"

    return path.read_bytes(), ct


def _fetch_remote_logo_bytes(url: str) -> tuple[bytes, str]:
    try:
        req = Request(url, headers={"User-Agent": "otf-scheduler/1.0"})
        with urlopen(req, timeout=10) as resp:
            content = resp.read()
            content_type = resp.headers.get("Content-Type") or "image/png"
            return content, content_type
    except HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Logo fetch failed: HTTP {e.code}")
    except URLError as e:
        raise HTTPException(status_code=502, detail=f"Logo fetch failed: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Logo fetch failed: {e}")


def _log_submission(db: Session, employee_id: UUID, company_id: UUID, source: str = "mobile", note: Optional[str] = None):
    # avoids requiring a new SQLAlchemy model right now
    db.execute(
        text(
            """
            INSERT INTO employee_availability_submissions (employee_id, company_id, source, note)
            VALUES (:employee_id, :company_id, :source, :note)
            """
        ),
        {"employee_id": str(employee_id), "company_id": str(company_id), "source": source, "note": note},
    )


@router.get("/{employee_id}/meta")
def get_employee_meta(employee_id: UUID, db: Session = Depends(get_db)):
    emp = db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    company = db.get(Company, emp.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return {
        "employee_id": str(emp.employee_id),
        "employee_name": emp.name,
        "company_id": str(company.company_id),
        "company_name": company.name,
        "company_timezone": company.timezone,
        "company_logo_url": company.logo_url,
    }


@router.get("/{employee_id}/logo")
def get_employee_company_logo(employee_id: UUID, db: Session = Depends(get_db)):
    emp = db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    company = db.get(Company, emp.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not company.logo_url:
        raise HTTPException(status_code=404, detail="Company logo not set")

    raw = company.logo_url.strip()

    if _is_http_url(raw):
        content, content_type = _fetch_remote_logo_bytes(raw)
    else:
        content, content_type = _read_local_logo_bytes(raw)

    return Response(content=content, media_type=content_type)


# -------------------------
# ✅ NEW: single atomic submit endpoint
# -------------------------

from pydantic import BaseModel

class EmployeeFormSubmit(BaseModel):
    availability: list[AvailabilityBlockCreate] = []
    unavailability: list[UnavailabilityBlockCreate] = []
    timeoff: list[TimeOffCreate] = []
    pto: list[PTOCreate] = []
    rules: list[RuleUpsert] = []
    source: str = "mobile"
    note: Optional[str] = None


@router.post("/{employee_id}/submit")
def submit_employee_form(
    employee_id: UUID,
    payload: EmployeeFormSubmit,
    db: Session = Depends(get_db),
):
    emp = _require_employee(db, employee_id)

    # One transaction: replace everything
    db.execute(delete(EmployeeAvailability).where(EmployeeAvailability.employee_id == employee_id))
    db.execute(delete(EmployeeUnavailability).where(EmployeeUnavailability.employee_id == employee_id))
    db.execute(delete(EmployeeTimeOff).where(EmployeeTimeOff.employee_id == employee_id))
    db.execute(delete(EmployeePTO).where(EmployeePTO.employee_id == employee_id))
    db.execute(delete(EmployeeRule).where(EmployeeRule.employee_id == employee_id))

    for b in payload.availability:
        validate_time_range(b.start_time, b.end_time)
        db.add(
            EmployeeAvailability(
                employee_id=employee_id,
                day_of_week=b.day_of_week,
                start_time=b.start_time,
                end_time=b.end_time,
                type=AvailabilityType(b.type),
            )
        )

    for b in payload.unavailability:
        validate_time_range(b.start_time, b.end_time)
        db.add(
            EmployeeUnavailability(
                employee_id=employee_id,
                day_of_week=b.day_of_week,
                start_time=b.start_time,
                end_time=b.end_time,
                reason=b.reason,
            )
        )

    for b in payload.timeoff:
        if b.end_date < b.start_date:
            raise HTTPException(status_code=400, detail="timeoff.end_date must be >= start_date")
        db.add(EmployeeTimeOff(employee_id=employee_id, start_date=b.start_date, end_date=b.end_date, note=b.note))

    for b in payload.pto:
        if b.end_date < b.start_date:
            raise HTTPException(status_code=400, detail="pto.end_date must be >= start_date")
        db.add(EmployeePTO(employee_id=employee_id, start_date=b.start_date, end_date=b.end_date, note=b.note))

    for r in payload.rules:
        db.add(
            EmployeeRule(
                employee_id=employee_id,
                rule_type=r.rule_type,
                value_json=r.value_json,
                effective_start=date.fromisoformat(r.effective_start) if r.effective_start else None,
                effective_end=date.fromisoformat(r.effective_end) if r.effective_end else None,
            )
        )

    # ✅ This is the “truth” marker
    _log_submission(db, employee_id=employee_id, company_id=emp.company_id, source=payload.source, note=payload.note)

    db.commit()
    return {"status": "ok"}


# -------------------------
# Existing endpoints (keep)
# You can optionally also log submission here, but it will create multiple submission rows
# if the mobile app calls 4 endpoints separately.
# -------------------------

@router.post("/{employee_id}/availability/replace")
def replace_availability(employee_id: UUID, blocks: list[AvailabilityBlockCreate], db: Session = Depends(get_db)):
    _require_employee(db, employee_id)
    db.execute(delete(EmployeeAvailability).where(EmployeeAvailability.employee_id == employee_id))
    for b in blocks:
        validate_time_range(b.start_time, b.end_time)
        db.add(
            EmployeeAvailability(
                employee_id=employee_id,
                day_of_week=b.day_of_week,
                start_time=b.start_time,
                end_time=b.end_time,
                type=AvailabilityType(b.type),
            )
        )
    db.commit()
    return {"status": "ok", "count": len(blocks)}


@router.post("/{employee_id}/unavailability/replace")
def replace_unavailability(employee_id: UUID, blocks: list[UnavailabilityBlockCreate], db: Session = Depends(get_db)):
    _require_employee(db, employee_id)
    db.execute(delete(EmployeeUnavailability).where(EmployeeUnavailability.employee_id == employee_id))
    for b in blocks:
        validate_time_range(b.start_time, b.end_time)
        db.add(
            EmployeeUnavailability(
                employee_id=employee_id,
                day_of_week=b.day_of_week,
                start_time=b.start_time,
                end_time=b.end_time,
                reason=b.reason,
            )
        )
    db.commit()
    return {"status": "ok", "count": len(blocks)}


@router.post("/{employee_id}/timeoff/replace")
def replace_time_off(employee_id: UUID, blocks: list[TimeOffCreate], db: Session = Depends(get_db)):
    _require_employee(db, employee_id)
    db.execute(delete(EmployeeTimeOff).where(EmployeeTimeOff.employee_id == employee_id))
    for b in blocks:
        if b.end_date < b.start_date:
            raise HTTPException(status_code=400, detail="end_date must be >= start_date")
        db.add(EmployeeTimeOff(employee_id=employee_id, start_date=b.start_date, end_date=b.end_date, note=b.note))
    db.commit()
    return {"status": "ok", "count": len(blocks)}


@router.post("/{employee_id}/pto/replace")
def replace_pto(employee_id: UUID, blocks: list[PTOCreate], db: Session = Depends(get_db)):
    _require_employee(db, employee_id)
    db.execute(delete(EmployeePTO).where(EmployeePTO.employee_id == employee_id))
    for b in blocks:
        if b.end_date < b.start_date:
            raise HTTPException(status_code=400, detail="end_date must be >= start_date")
        db.add(EmployeePTO(employee_id=employee_id, start_date=b.start_date, end_date=b.end_date, note=b.note))
    db.commit()
    return {"status": "ok", "count": len(blocks)}


@router.put("/{employee_id}/rules")
def upsert_rules(employee_id: UUID, rules: list[RuleUpsert], db: Session = Depends(get_db)):
    _require_employee(db, employee_id)
    db.execute(delete(EmployeeRule).where(EmployeeRule.employee_id == employee_id))
    for r in rules:
        db.add(
            EmployeeRule(
                employee_id=employee_id,
                rule_type=r.rule_type,
                value_json=r.value_json,
                effective_start=date.fromisoformat(r.effective_start) if r.effective_start else None,
                effective_end=date.fromisoformat(r.effective_end) if r.effective_end else None,
            )
        )
    db.commit()
    return {"status": "ok", "count": len(rules)}
