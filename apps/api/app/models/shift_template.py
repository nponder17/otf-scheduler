from sqlalchemy import Column, Integer, Text, Time, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

class ShiftTemplate(Base):
    __tablename__ = "shift_templates"

    shift_template_id = Column(UUID(as_uuid=True), primary_key=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.company_id"), nullable=False)
    studio_id = Column(UUID(as_uuid=True), ForeignKey("studios.studio_id"), nullable=False)

    label = Column(Text, nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Sun ... 6=Sat
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    required_count = Column(Integer, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
