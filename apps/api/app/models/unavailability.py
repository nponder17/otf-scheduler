import uuid
from sqlalchemy import Column, Time, SmallInteger, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base

class EmployeeUnavailability(Base):
    __tablename__ = "employee_unavailability"

    unavailability_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    day_of_week = Column(SmallInteger, nullable=False)  # 0=Sun ... 6=Sat
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    reason = Column(String, nullable=True)
