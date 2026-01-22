from sqlalchemy import Column, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.sql.sqltypes import DateTime

from app.core.database import Base

# IMPORTANT: forces studios table to be registered in SQLAlchemy metadata
from app.models.studio import Studio  # noqa: F401


class ScheduleRun(Base):
    __tablename__ = "schedule_runs"

    schedule_run_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.company_id", ondelete="CASCADE"), nullable=False)
    studio_id = Column(UUID(as_uuid=True), ForeignKey("studios.studio_id", ondelete="CASCADE"), nullable=False)

    month_start = Column(Date, nullable=False)
    month_end = Column(Date, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
