from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class CompanyOut(BaseModel):
    company_id: UUID
    name: str
    timezone: str
    logo_url: str | None = None
