from pydantic import BaseModel


class RequirementSummary(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    status: str

    class Config:
        from_attributes = True
