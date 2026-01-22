from pydantic import BaseModel, EmailStr, Field
from datetime import date
from typing import Optional
from uuid import UUID

class CompanyCreate(BaseModel):
    name: str
    timezone: str = "America/Detroit"

class RoleCreate(BaseModel):
    name: str

class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    hire_date: date | None = None

class EmployeeRoleAssign(BaseModel):
    role_ids: list[UUID] = Field(default_factory=list)
