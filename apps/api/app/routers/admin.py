from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, text
from uuid import UUID
from pathlib import Path

from app.core.database import get_db
from app.routers.auth import get_current_manager, get_current_system_admin
from app.schemas.admin import (
    CompanyCreate,
    RoleCreate,
    EmployeeCreate,
    EmployeeRoleAssign,
)
from app.schemas.company import CompanyOut

from app.models.company import Company
from app.models.role import Role
from app.models.employee import Employee
from app.models.employee_role import EmployeeRole
from app.models.manager import Manager
from app.models.system_admin import SystemAdmin

from app.schemas.employees import EmployeeOut
from sqlalchemy import text
from typing import Union, Optional

router = APIRouter()
security = HTTPBearer()

FORM_BASE_URL = "http://localhost:8081"

# ✅ apps/api/app/routers/admin.py -> parents[3] == apps/
# so this points to: apps/mobile/assets/logos
LOGOS_DIR = (Path(__file__).resolve().parents[3] / "mobile" / "assets" / "logos").resolve()


# Helper function to allow either manager or system admin
def get_current_manager_or_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> tuple[Union[Manager, SystemAdmin], Optional[UUID]]:
    """Get current user (manager or system admin) and their company_id if manager."""
    from app.routers.auth import decode_token
    
    token = credentials.credentials
    payload = decode_token(token)
    role = payload.get("role")
    user_id = payload.get("sub")
    
    if role == "manager":
        manager = db.get(Manager, UUID(user_id))
        if not manager or not manager.is_active:
            raise HTTPException(status_code=401, detail="Manager not found or inactive")
        return (manager, manager.company_id)
    elif role == "system_admin":
        admin = db.get(SystemAdmin, UUID(user_id))
        if not admin or not admin.is_active:
            raise HTTPException(status_code=401, detail="System admin not found or inactive")
        return (admin, None)
    else:
        raise HTTPException(status_code=403, detail="This endpoint requires manager or system admin role")


# --- Companies ---
@router.post("/companies")
def create_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """Create a new company (system admin only)."""
    c = Company(name=payload.name, timezone=payload.timezone)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("/companies")
def list_companies(
    db: Session = Depends(get_db),
    user_and_company: tuple[Union[Manager, SystemAdmin], Optional[UUID]] = Depends(get_current_manager_or_admin),
):
    """List companies. Managers see only their company."""
    user, company_id = user_and_company
    
    # If manager, return only their company
    if company_id:
        company = db.get(Company, company_id)
        return [company] if company else []
    # System admin can see all (but this endpoint is for managers, so they'd use /system-admin/companies)
    return []


@router.get("/companies/all")
def list_all_companies(
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """List all companies (system admin only)."""
    return db.execute(select(Company)).scalars().all()


@router.get("/companies/{company_id}", response_model=CompanyOut)
def get_company(company_id: UUID, db: Session = Depends(get_db)):
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    return c


@router.get("/companies/{company_id}/logo")
def get_company_logo(company_id: UUID, db: Session = Depends(get_db)):
    """
    Returns the company's logo image.

    Preferred DB value:
      logo_url = "otf.png"   (a filename inside apps/mobile/assets/logos)

    Optional:
      logo_url = "https://..." (ONLY if it returns an image content-type)
    """
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not company.logo_url:
        raise HTTPException(status_code=404, detail="Company logo not set")

    val = company.logo_url.strip()

    # --- Case A: Local filename in apps/mobile/assets/logos ---
    if not val.startswith("http://") and not val.startswith("https://") and not val.startswith("/"):
        # prevent path traversal: only allow filenames
        if "/" in val or "\\" in val:
            raise HTTPException(status_code=400, detail="Invalid logo filename")

        logo_path = (LOGOS_DIR / val).resolve()

        # ensure the resolved path is still under LOGOS_DIR
        if not str(logo_path).startswith(str(LOGOS_DIR)):
            raise HTTPException(status_code=400, detail="Invalid logo path")

        if not logo_path.exists() or not logo_path.is_file():
            raise HTTPException(status_code=404, detail=f"Logo file not found: {val}")

        ext = logo_path.suffix.lower()
        media = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }.get(ext, "application/octet-stream")

        return FileResponse(str(logo_path), media_type=media)

    # --- Case B: Absolute local file path (works locally; not ideal long-term) ---
    if val.startswith("/"):
        logo_path = Path(val).resolve()
        if not logo_path.exists() or not logo_path.is_file():
            raise HTTPException(status_code=404, detail=f"Logo file not found: {logo_path}")

        ext = logo_path.suffix.lower()
        media = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }.get(ext, "application/octet-stream")

        return FileResponse(str(logo_path), media_type=media)

    # --- Case C: Remote URL (only if it actually returns an image) ---
    # We avoid adding a hard dependency on requests unless you truly need remote logos.
    try:
        import requests  # type: ignore
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Remote logo_url requires 'requests'. Prefer using a local filename like 'otf.png'.",
        )

    try:
        r = requests.get(val, timeout=10, allow_redirects=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch logo: {e}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Logo fetch failed with status {r.status_code}")

    content_type = (r.headers.get("content-type") or "").lower()

    # ✅ if we got HTML, that's not a logo — reject it
    if "image/" not in content_type:
        raise HTTPException(
            status_code=502,
            detail=f"Remote logo_url did not return an image (content-type={content_type})",
        )

    return Response(content=r.content, media_type=content_type)


# --- Roles ---
@router.post("/companies/{company_id}/roles")
def create_role(company_id: UUID, payload: RoleCreate, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    r = Role(company_id=company_id, name=payload.name)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/companies/{company_id}/roles")
def list_roles(company_id: UUID, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return db.execute(select(Role).where(Role.company_id == company_id)).scalars().all()


# --- Employees ---
@router.post("/companies/{company_id}/employees", response_model=EmployeeOut)
def create_employee(
    company_id: UUID,
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    user_and_company: tuple[Union[Manager, SystemAdmin], Optional[UUID]] = Depends(get_current_manager_or_admin),
):
    """Create employee. Managers can only add to their own company."""
    user, user_company_id = user_and_company
    
    # Managers can only add employees to their own company
    if user_company_id and user_company_id != company_id:
        raise HTTPException(status_code=403, detail="You can only add employees to your own company")
    
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    e = Employee(
        company_id=company_id,
        name=payload.name,
        email=str(payload.email),
        phone=payload.phone,
        hire_date=payload.hire_date,
        is_active=True,
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    return EmployeeOut(
        employee_id=str(e.employee_id),
        company_id=str(e.company_id),
        name=e.name,
        email=e.email,
        phone=e.phone,
        hire_date=e.hire_date,
        is_active=e.is_active,
        form_url=f"{FORM_BASE_URL}/form/{e.employee_id}",
    )


@router.get("/companies/{company_id}/employees", response_model=list[EmployeeOut])
def list_employees(
    company_id: UUID,
    db: Session = Depends(get_db),
    user_and_company: tuple[Union[Manager, SystemAdmin], Optional[UUID]] = Depends(get_current_manager_or_admin),
):
    """List employees. Managers can only see their own company's employees."""
    user, user_company_id = user_and_company
    
    # Managers can only see their own company's employees
    if user_company_id and user_company_id != company_id:
        raise HTTPException(status_code=403, detail="You can only view employees from your own company")
    
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    emps = db.execute(select(Employee).where(Employee.company_id == company_id)).scalars().all()

    out: list[EmployeeOut] = []
    for e in emps:
        out.append(
            EmployeeOut(
                employee_id=str(e.employee_id),
                company_id=str(e.company_id),
                name=e.name,
                email=e.email,
                phone=e.phone,
                hire_date=e.hire_date,
                is_active=e.is_active,
                form_url=f"{FORM_BASE_URL}/form/{e.employee_id}",
            )
        )
    return out


# --- Assign roles to an employee ---
@router.put("/employees/{employee_id}/roles")
def set_employee_roles(employee_id: UUID, payload: EmployeeRoleAssign, db: Session = Depends(get_db)):
    emp = db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    db.execute(delete(EmployeeRole).where(EmployeeRole.employee_id == employee_id))

    for role_id in payload.role_ids:
        db.add(EmployeeRole(employee_id=employee_id, role_id=role_id))

    db.commit()
    return {"status": "ok", "role_count": len(payload.role_ids)}


# ============================================================
# ✅ NEW: Clear ALL form submissions for a company (1 click)
# ============================================================
@router.post("/companies/{company_id}/forms/clear")
def clear_company_form_submissions(company_id: UUID, db: Session = Depends(get_db)):
    """
    Clears EVERYTHING employees submitted via the forms for a given company.

    Deletes rows (for employees in company) from:
      - employee_availability
      - employee_unavailability
      - employee_time_off
      - employee_pto
      - employee_availability_submissions
    """
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    deletes = {
        "employee_availability": """
            DELETE FROM employee_availability ea
            USING employees e
            WHERE ea.employee_id = e.employee_id
              AND e.company_id = :company_id
        """,
        "employee_unavailability": """
            DELETE FROM employee_unavailability eu
            USING employees e
            WHERE eu.employee_id = e.employee_id
              AND e.company_id = :company_id
        """,
        "employee_time_off": """
            DELETE FROM employee_time_off eto
            USING employees e
            WHERE eto.employee_id = e.employee_id
              AND e.company_id = :company_id
        """,
        "employee_pto": """
            DELETE FROM employee_pto ep
            USING employees e
            WHERE ep.employee_id = e.employee_id
              AND e.company_id = :company_id
        """,
        "employee_availability_submissions": """
            DELETE FROM employee_availability_submissions eas
            USING employees e
            WHERE eas.employee_id = e.employee_id
              AND e.company_id = :company_id
        """,
    }

    counts: dict[str, int] = {}
    try:
        for table_name, sql in deletes.items():
            res = db.execute(text(sql), {"company_id": str(company_id)})
            counts[table_name] = int(getattr(res, "rowcount", 0) or 0)

        db.commit()
        return {
            "company_id": str(company_id),
            "deleted": counts,
            "total_deleted": sum(counts.values()),
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear form submissions: {str(e)}")


# ============================================================
# ✅ NEW: Clear schedule artifacts (for faster testing)
# ============================================================
@router.post("/companies/{company_id}/schedule/clear")
def clear_company_schedule_artifacts(company_id: UUID, db: Session = Depends(get_db)):
    """
    Clears all schedule runs + scheduled shifts + audits for a given company.

    This speeds up testing since you can regenerate clean runs quickly.
    """
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    try:
        # Delete scheduled shifts for any run belonging to this company
        res1 = db.execute(
            text(
                """
                DELETE FROM scheduled_shifts ss
                USING schedule_runs sr
                WHERE ss.schedule_run_id = sr.schedule_run_id
                  AND sr.company_id = :company_id
                """
            ),
            {"company_id": str(company_id)},
        )

        # Delete audits for runs belonging to this company
        res2 = db.execute(
            text(
                """
                DELETE FROM schedule_audit_candidate sac
                USING schedule_runs sr
                WHERE sac.schedule_run_id = sr.schedule_run_id
                  AND sr.company_id = :company_id
                """
            ),
            {"company_id": str(company_id)},
        )
        res3 = db.execute(
            text(
                """
                DELETE FROM schedule_audit_shift sas
                USING schedule_runs sr
                WHERE sas.schedule_run_id = sr.schedule_run_id
                  AND sr.company_id = :company_id
                """
            ),
            {"company_id": str(company_id)},
        )

        # Finally delete the runs
        res4 = db.execute(
            text("DELETE FROM schedule_runs WHERE company_id = :company_id"),
            {"company_id": str(company_id)},
        )

        db.commit()
        return {
            "company_id": str(company_id),
            "deleted": {
                "scheduled_shifts": int(getattr(res1, "rowcount", 0) or 0),
                "schedule_audit_candidate": int(getattr(res2, "rowcount", 0) or 0),
                "schedule_audit_shift": int(getattr(res3, "rowcount", 0) or 0),
                "schedule_runs": int(getattr(res4, "rowcount", 0) or 0),
            },
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear schedule artifacts: {str(e)}")


@router.post("/migrate/add-password-hash")
def run_password_hash_migration(db: Session = Depends(get_db)):
    """
    Run migration to add password_hash column to employees table.
    This endpoint can be called once to add the column.
    Safe to call multiple times (uses IF NOT EXISTS).
    """
    try:
        # Check if column already exists
        check_result = db.execute(
            text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'employees' AND column_name = 'password_hash'
            """)
        ).fetchone()

        if check_result:
            return {
                "message": "Column 'password_hash' already exists",
                "status": "skipped"
            }

        # Add the column
        db.execute(text("ALTER TABLE employees ADD COLUMN password_hash VARCHAR"))
        db.commit()

        # Verify it was added
        verify_result = db.execute(
            text("""
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'employees' AND column_name = 'password_hash'
            """)
        ).fetchone()

        if verify_result:
            return {
                "message": "Migration successful",
                "status": "completed",
                "column": {
                    "name": verify_result[0],
                    "type": verify_result[1],
                    "nullable": verify_result[2] == "YES"
                }
            }
        else:
            raise Exception("Column was not created")

    except Exception as e:
        db.rollback()
        # If error is "column already exists", that's okay
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
            return {
                "message": "Column already exists",
                "status": "skipped"
            }
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")
