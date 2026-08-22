from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str
    project_id: int | None = None
    limit: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.70, ge=0.0, le=1.0)


class SearchResultItem(BaseModel):
    id: int
    code: str
    title: str
    requirement_id: int | None
    status: str
    score: float


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
