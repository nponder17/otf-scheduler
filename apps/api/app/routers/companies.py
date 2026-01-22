from datetime import datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, text
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db
from app.models.company import Company
from app.models.employee import Employee
from app.schemas.employees import EmployeeCreate, EmployeeOut

router = APIRouter()

# For now, this is where the mobile/web app runs in dev.
# Later you’ll switch to your real domain.
FORM_BASE_URL = "http://localhost:8081"

# Staleness policy for admin chips
STALE_AFTER_DAYS = 14


# ----------------------------
# Minimal "list companies/studios" outputs for Manager UI
# ----------------------------
class CompanyOut(BaseModel):
    company_id: str
    name: str


class StudioOut(BaseModel):
    studio_id: str
    name: str


@router.get("", response_model=list[CompanyOut])
@router.get("/", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db)):
    companies = db.execute(select(Company).order_by(Company.name.asc())).scalars().all()
    return [{"company_id": str(c.company_id), "name": c.name} for c in companies]


@router.get("/{company_id}/studios", response_model=list[StudioOut])
def list_company_studios(company_id: UUID, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    rows = db.execute(
        text(
            """
            SELECT studio_id, name
            FROM studios
            WHERE company_id = :company_id
            ORDER BY name ASC
            """
        ),
        {"company_id": str(company_id)},
    ).mappings().all()

    return [{"studio_id": str(r["studio_id"]), "name": r["name"]} for r in rows]


# ----------------------------
# Existing employee endpoints
# ----------------------------
@router.post("/{company_id}/employees", response_model=EmployeeOut)
def create_employee(company_id: UUID, payload: EmployeeCreate, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    emp = Employee(
        company_id=company_id,
        name=payload.name,
        email=str(payload.email),
        phone=payload.phone,
        hire_date=payload.hire_date,
        is_active=payload.is_active,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    form_url = f"{FORM_BASE_URL}/form/{emp.employee_id}"

    # NOTE: these new fields must exist on EmployeeOut (or be Optional in schema)
    return EmployeeOut(
        employee_id=str(emp.employee_id),
        company_id=str(emp.company_id),
        name=emp.name,
        email=emp.email,
        phone=emp.phone,
        hire_date=emp.hire_date,
        is_active=emp.is_active,
        form_url=form_url,
        last_availability_submit_at=None,
        availability_status="missing",
        availability_status_reason="no_submission",
    )


@router.get("/{company_id}/employees", response_model=list[EmployeeOut])
def list_company_employees(company_id: UUID, db: Session = Depends(get_db)):
    # Ensure company exists (keeps errors friendly)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    rows = db.execute(
        text(
            """
            SELECT
              e.employee_id,
              e.company_id,
              e.name,
              e.email,
              e.phone,
              e.is_active,
              e.hire_date,
              e.created_at,
              s.last_submit_at AS last_availability_submit_at
            FROM employees e
            LEFT JOIN (
              SELECT employee_id, MAX(submitted_at) AS last_submit_at
              FROM employee_availability_submissions
              GROUP BY employee_id
            ) s ON s.employee_id = e.employee_id
            WHERE e.company_id = :company_id
            ORDER BY e.created_at DESC
            """
        ),
        {"company_id": company_id},  # ✅ pass UUID, not str
    ).mappings().all()

    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(days=14)

    out: list[EmployeeOut] = []
    for r in rows:
        last = r["last_availability_submit_at"]

        if last is None:
            status = "missing"
            reason = "no_submission"
        else:
            status = "stale" if last < stale_cutoff else "ok"
            reason = "older_than_14_days" if status == "stale" else None

        out.append(
            EmployeeOut(
                employee_id=str(r["employee_id"]),
                company_id=str(r["company_id"]),
                name=r["name"],
                email=r["email"],
                phone=r["phone"],
                hire_date=r["hire_date"],
                is_active=r["is_active"],
                form_url=f"{FORM_BASE_URL}/form/{r['employee_id']}",
                last_availability_submit_at=last,
                availability_status=status,
                availability_status_reason=reason,
            )
        )

    return out
