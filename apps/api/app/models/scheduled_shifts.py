from sqlalchemy import Column, Date, ForeignKey, Integer, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.sql.sqltypes import DateTime

from app.core.database import Base

from app.models.schedule_runs import ScheduleRun  # noqa: F401
from app.models.employee import Employee  # noqa: F401
from app.models.studio import Studio  # noqa: F401


class ScheduledShift(Base):
    __tablename__ = "scheduled_shifts"

    scheduled_shift_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())

    schedule_run_id = Column(UUID(as_uuid=True), ForeignKey("schedule_runs.schedule_run_id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)
    studio_id = Column(UUID(as_uuid=True), ForeignKey("studios.studio_id", ondelete="CASCADE"), nullable=False)

    shift_date = Column(Date, nullable=False)
    day_of_week = Column(Integer, nullable=False)

    label = Column(Text, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
