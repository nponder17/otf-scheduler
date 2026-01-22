from sqlalchemy import Column, Date, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql.sqltypes import DateTime

from app.core.database import Base

class EmployeePTO(Base):
    __tablename__ = "employee_pto"

    pto_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False, index=True)

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
