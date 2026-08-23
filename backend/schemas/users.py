from pydantic import BaseModel


class UserAdminUpdateRequest(BaseModel):
    is_superadmin: bool | None = None
    can_create_projects: bool | None = None
