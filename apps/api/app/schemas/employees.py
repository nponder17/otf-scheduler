from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional, Literal

class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    hire_date: Optional[date] = None
    is_active: bool = True

class EmployeeOut(BaseModel):
    employee_id: str
    company_id: str
    name: str
    email: str
    phone: Optional[str] = None
    hire_date: Optional[date] = None
    is_active: bool
    form_url: str
    last_availability_submit_at: Optional[datetime] = None
    availability_status: Literal["ok", "missing", "stale"] = "missing"
    availability_status_reason: Optional[Literal["no_submission", "older_than_14_days"]] = None
