from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from uuid import UUID
from pydantic import BaseModel, EmailStr
from datetime import date
from typing import Optional

from app.core.database import get_db
from app.routers.auth import get_current_system_admin, get_password_hash
from app.models.company import Company
from app.models.manager import Manager
from app.models.employee import Employee
from app.models.system_admin import SystemAdmin
from app.schemas.admin import CompanyCreate, EmployeeCreate

router = APIRouter()


class ManagerCreate(BaseModel):
    company_id: UUID
    name: str
    email: EmailStr
    password: str


class SystemAdminCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    hire_date: Optional[date] = None
    is_active: Optional[bool] = None


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
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """List all companies (system admin only)."""
    return db.execute(select(Company)).scalars().all()


# --- Managers ---
@router.post("/managers")
def create_manager(
    payload: ManagerCreate,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """Create a new manager for a company (system admin only)."""
    # Verify company exists
    company = db.get(Company, payload.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if email already exists
    existing = db.execute(select(Manager).where(Manager.email == payload.email.lower())).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Manager with this email already exists")

    manager = Manager(
        company_id=payload.company_id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        is_active=True,
    )
    db.add(manager)
    db.commit()
    db.refresh(manager)
    return {
        "manager_id": str(manager.manager_id),
        "company_id": str(manager.company_id),
        "name": manager.name,
        "email": manager.email,
        "is_active": manager.is_active,
    }


@router.get("/companies/{company_id}/managers")
def list_managers(
    company_id: UUID,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """List all managers for a company (system admin only)."""
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    managers = db.execute(select(Manager).where(Manager.company_id == company_id)).scalars().all()
    return [
        {
            "manager_id": str(m.manager_id),
            "company_id": str(m.company_id),
            "name": m.name,
            "email": m.email,
            "is_active": m.is_active,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in managers
    ]


# --- Employees ---
@router.post("/companies/{company_id}/employees")
def create_employee(
    company_id: UUID,
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """Create a new employee for a company (system admin only)."""
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    employee = Employee(
        company_id=company_id,
        name=payload.name,
        phone=payload.phone,
        email=payload.email.lower(),
        hire_date=payload.hire_date,
        is_active=True,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return {
        "employee_id": str(employee.employee_id),
        "company_id": str(employee.company_id),
        "name": employee.name,
        "email": employee.email,
        "phone": employee.phone,
        "hire_date": employee.hire_date.isoformat() if employee.hire_date else None,
        "is_active": employee.is_active,
    }


@router.get("/companies/{company_id}/employees")
def list_employees(
    company_id: UUID,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """List all employees for a company (system admin only)."""
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    employees = db.execute(select(Employee).where(Employee.company_id == company_id)).scalars().all()
    return [
        {
            "employee_id": str(e.employee_id),
            "company_id": str(e.company_id),
            "name": e.name,
            "email": e.email,
            "phone": e.phone,
            "hire_date": e.hire_date.isoformat() if e.hire_date else None,
            "is_active": e.is_active,
        }
        for e in employees
    ]


@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """Update an employee (system admin only)."""
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Update fields if provided
    if payload.name is not None:
        employee.name = payload.name
    if payload.email is not None:
        # Check if email is already taken by another employee
        existing = db.execute(select(Employee).where(Employee.email == payload.email.lower(), Employee.employee_id != employee_id)).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another employee")
        employee.email = payload.email.lower()
    if payload.phone is not None:
        employee.phone = payload.phone
    if payload.hire_date is not None:
        employee.hire_date = payload.hire_date
    if payload.is_active is not None:
        employee.is_active = payload.is_active

    db.commit()
    db.refresh(employee)
    return {
        "employee_id": str(employee.employee_id),
        "company_id": str(employee.company_id),
        "name": employee.name,
        "email": employee.email,
        "phone": employee.phone,
        "hire_date": employee.hire_date.isoformat() if employee.hire_date else None,
        "is_active": employee.is_active,
    }


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """Delete an employee (system admin only)."""
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    db.delete(employee)
    db.commit()
    return {"message": "Employee deleted successfully"}


# --- System Admins ---
@router.post("/system-admins")
def create_system_admin(
    payload: SystemAdminCreate,
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """Create a new system admin (system admin only)."""
    # Check if email already exists
    existing = db.execute(select(SystemAdmin).where(SystemAdmin.email == payload.email.lower())).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="System admin with this email already exists")

    admin = SystemAdmin(
        name=payload.name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {
        "admin_id": str(admin.admin_id),
        "name": admin.name,
        "email": admin.email,
        "is_active": admin.is_active,
    }


@router.get("/system-admins")
def list_system_admins(
    db: Session = Depends(get_db),
    current_admin: SystemAdmin = Depends(get_current_system_admin),
):
    """List all system admins (system admin only)."""
    admins = db.execute(select(SystemAdmin)).scalars().all()
    return [
        {
            "admin_id": str(a.admin_id),
            "name": a.name,
            "email": a.email,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in admins
    ]
