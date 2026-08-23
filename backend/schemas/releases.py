from datetime import datetime

from pydantic import BaseModel


class ReleaseCreate(BaseModel):
    project_id: int
    version_name: str
    note: str | None = None


class ReleaseResponse(BaseModel):
    id: int
    project_id: int
    version_name: str
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True
