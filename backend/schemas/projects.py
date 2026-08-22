from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str
    description: str | None = None
    key: str
    lead_user_id: int | None = None
    modules: list[str] = []
    status: str
    require_requirement_link: bool
    auto_resolve_days: int | None = None
    ai_impact_suggestions: bool
    slack_alerts_enabled: bool
    retention_days: int
    default_severity: str


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    key: str
    lead_user_id: int | None
    modules: list[str]
    status: str
    require_requirement_link: bool
    auto_resolve_days: int | None
    ai_impact_suggestions: bool
    slack_alerts_enabled: bool
    retention_days: int
    default_severity: str
    created_at: datetime

    class Config:
        from_attributes = True
