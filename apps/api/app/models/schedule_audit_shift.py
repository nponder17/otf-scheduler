from sqlalchemy import Column, Date, Time, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from app.core.database import Base


class ScheduleAuditShift(Base):
    __tablename__ = "schedule_audit_shift"

    audit_shift_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    schedule_run_id = Column(UUID(as_uuid=True), ForeignKey("schedule_runs.schedule_run_id", ondelete="CASCADE"), nullable=False)

    shift_date = Column(Date, nullable=False)
    label = Column(Text, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    required_count = Column(Integer, nullable=False)
    assigned_count = Column(Integer, nullable=False)
    candidate_count = Column(Integer, nullable=False)
    missing_count = Column(Integer, nullable=False)

    rejection_summary = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
