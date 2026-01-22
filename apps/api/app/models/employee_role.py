from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base

class EmployeeRole(Base):
    __tablename__ = "employee_roles"

    employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        primary_key=True,
    )

    role_id = Column(
        UUID(as_uuid=True),
        ForeignKey("roles.role_id", ondelete="CASCADE"),
        primary_key=True,
    )
