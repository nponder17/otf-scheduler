from datetime import date
from pydantic import BaseModel
from typing import Optional

class PTOCreate(BaseModel):
    start_date: date
    end_date: date
    note: Optional[str] = None
