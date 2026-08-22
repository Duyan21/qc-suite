from pydantic import BaseModel


class RoleResponse(BaseModel):
    id: int
    key: str
    name: str

    class Config:
        from_attributes = True


class PermissionMatrixCell(BaseModel):
    role_key: str
    area: str
    level: str


class PermissionMatrixResponse(BaseModel):
    roles: list[RoleResponse]
    cells: list[PermissionMatrixCell]


class PermissionMatrixUpdateItem(BaseModel):
    role_key: str
    area: str
    level: str


class PermissionMatrixUpdateRequest(BaseModel):
    cells: list[PermissionMatrixUpdateItem]
