import uuid
from sqlalchemy import Column, Time, SmallInteger, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.core.database import Base

class AvailabilityType(str, enum.Enum):
    available = "available"
    preferred = "preferred"

class EmployeeAvailability(Base):
    __tablename__ = "employee_availability"

    availability_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    day_of_week = Column(SmallInteger, nullable=False)  # 0=Sun ... 6=Sat
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    type = Column(Enum(AvailabilityType, name="availability_type"), nullable=False, default=AvailabilityType.available)
