from datetime import datetime

from pydantic import BaseModel, Field


class ModuleCreate(BaseModel):
    name: str = Field(max_length=100)


class ModuleUpdate(BaseModel):
    name: str = Field(max_length=100)


class ModuleResponse(BaseModel):
    id: int
    project_id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
