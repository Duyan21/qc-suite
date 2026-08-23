from typing import Literal

from pydantic import BaseModel

PermissionLevelLiteral = Literal["none", "read", "edit", "full"]
PermissionAreaLiteral = Literal[
    "project_settings",
    "members_roles",
    "requirements",
    "test_cases",
    "test_runs",
    "defects",
    "ai_tools",
    "audit_log",
]


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
    # Constrained so an invalid value is rejected with a 422 at the edge rather
    # than being written to role_permissions, where it would blow up
    # PermissionLevel(...) with a ValueError on every later permission check.
    area: PermissionAreaLiteral
    level: PermissionLevelLiteral


class PermissionMatrixUpdateRequest(BaseModel):
    cells: list[PermissionMatrixUpdateItem]
