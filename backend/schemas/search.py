from pydantic import BaseModel, Field

from schemas.common import RequirementSummary


class SearchRequest(BaseModel):
    project_id: int
    query: str
    limit: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.70, ge=0.0, le=1.0)


class SearchResultItem(BaseModel):
    id: int
    code: str
    title: str
    priority: str | None
    status: str
    requirement_id: int | None
    requirement: RequirementSummary | None
    last_result: str | None
    score: float


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
