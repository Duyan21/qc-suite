from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import User
from models.base import get_db
from schemas.auth import UserResponse
from schemas.users import UserAdminUpdateRequest
from services.auth_service import get_current_user

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_user)])


def _require_superadmin(current_user: User) -> None:
    if not current_user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires superadmin")


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_superadmin(current_user)
    return db.query(User).order_by(User.id).all()


@router.patch("/{id}", response_model=UserResponse)
def update_user(
    id: int,
    payload: UserAdminUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_superadmin(current_user)

    user = db.get(User, id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.is_superadmin is False and user.is_superadmin:
        other_superadmins = (
            db.query(User)
            .filter(User.is_superadmin.is_(True), User.id != user.id)
            .count()
        )
        if other_superadmins == 0:
            raise HTTPException(status_code=400, detail="Cannot remove the last superadmin")

    if payload.is_active is False and user.is_superadmin and user.is_active:
        other_active_superadmins = (
            db.query(User)
            .filter(User.is_superadmin.is_(True), User.is_active.is_(True), User.id != user.id)
            .count()
        )
        if other_active_superadmins == 0:
            raise HTTPException(status_code=400, detail="Cannot retire the last active superadmin")

    if payload.is_superadmin is not None:
        user.is_superadmin = payload.is_superadmin
    if payload.can_create_projects is not None:
        user.can_create_projects = payload.can_create_projects
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user
