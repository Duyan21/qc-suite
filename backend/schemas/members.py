from datetime import datetime

from pydantic import BaseModel, EmailStr


class MemberResponse(BaseModel):
    user_id: int
    email: EmailStr
    full_name: str | None
    status: str
    role_key: str
    role_name: str
    joined_at: datetime


class MemberInviteRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role_key: str


class MemberUpdateRequest(BaseModel):
    role_key: str | None = None
    status: str | None = None
