from sqlalchemy import Column, Date, ForeignKey, Integer, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.sql.sqltypes import DateTime

from app.core.database import Base

from app.models.company import Company  # noqa: F401
from app.models.studio import Studio  # noqa: F401


class ShiftInstance(Base):
    __tablename__ = "shift_instances"

    shift_instance_id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.company_id", ondelete="CASCADE"), nullable=False)
    studio_id = Column(UUID(as_uuid=True), ForeignKey("studios.studio_id", ondelete="CASCADE"), nullable=False)

    shift_template_id = Column(UUID(as_uuid=True), ForeignKey("shift_templates.shift_template_id", ondelete="CASCADE"), nullable=False)

    shift_date = Column(Date, nullable=False)
    day_of_week = Column(Integer, nullable=False)

    label = Column(Text, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    required_count = Column(Integer, nullable=False)
    status = Column(Text, nullable=False, server_default="draft")

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
