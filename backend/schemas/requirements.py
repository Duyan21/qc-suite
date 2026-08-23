from datetime import datetime
from typing import Literal

from pydantic import BaseModel

RequirementStatus = Literal["Draft", "Active", "Deprecated"]


class RequirementCreate(BaseModel):
    title: str
    description: str
    module: str | None = None
    status: RequirementStatus = "Draft"
    project_id: int


class RequirementUpdate(BaseModel):
    title: str
    description: str
    status: RequirementStatus
    change_note: str | None = None


class RequirementResponse(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    description: str
    module: str | None
    status: str
    is_current: bool
    change_note: str | None
    changed_by: str | None
    previous_version_id: int | None
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RequirementListResponse(BaseModel):
    items: list[RequirementResponse]
    total: int
    page: int
    limit: int
