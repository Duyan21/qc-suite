from datetime import datetime

from pydantic import BaseModel


class TestRunCreate(BaseModel):
    release_id: int
    executed_by: str | None = None
    note: str | None = None


class TestRunResponse(BaseModel):
    id: int
    release_id: int
    release_version: str
    executed_at: datetime
    executed_by: str | None
    note: str | None
