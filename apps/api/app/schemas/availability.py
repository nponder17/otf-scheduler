from pydantic import BaseModel, Field
from datetime import time
from typing import Literal
from datetime import date
from pydantic import BaseModel

AvailabilityType = Literal["available", "preferred"]

class AvailabilityBlockCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    type: AvailabilityType = "available"

class UnavailabilityBlockCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    reason: str | None = None


class TimeOffCreate(BaseModel):
    start_date: date
    end_date: date
    note: str | None = None

class RuleUpsert(BaseModel):
    rule_type: str
    value_json: dict
    effective_start: str | None = None
    effective_end: str | None = None
