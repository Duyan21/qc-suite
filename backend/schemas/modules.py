from datetime import datetime

from pydantic import BaseModel


class ModuleCreate(BaseModel):
    name: str


class ModuleUpdate(BaseModel):
    name: str


class ModuleResponse(BaseModel):
    id: int
    project_id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
