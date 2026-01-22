from sqlalchemy import Column, Date, Time, Integer, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from app.core.database import Base


class ScheduleAuditCandidate(Base):
    __tablename__ = "schedule_audit_candidate"

    audit_candidate_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    schedule_run_id = Column(UUID(as_uuid=True), ForeignKey("schedule_runs.schedule_run_id", ondelete="CASCADE"), nullable=False)

    shift_date = Column(Date, nullable=False)
    label = Column(Text, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.employee_id", ondelete="CASCADE"), nullable=False)

    eligible = Column(Boolean, nullable=False)
    rejection_reason = Column(Text, nullable=True)
    details = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
