from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import Role, RolePermission, User
from models.base import get_db
from schemas.roles import (
    PermissionMatrixCell,
    PermissionMatrixResponse,
    PermissionMatrixUpdateRequest,
    RoleResponse,
)
from services.auth_service import get_current_user

router = APIRouter(tags=["roles"], dependencies=[Depends(get_current_user)])


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(db: Session = Depends(get_db)):
    return db.query(Role).order_by(Role.id).all()


@router.get("/permissions/matrix", response_model=PermissionMatrixResponse)
def get_permission_matrix(db: Session = Depends(get_db)):
    roles = db.query(Role).order_by(Role.id).all()
    role_by_id = {r.id: r for r in roles}
    permissions = db.query(RolePermission).all()
    cells = [
        PermissionMatrixCell(role_key=role_by_id[rp.role_id].key, area=rp.area, level=rp.level)
        for rp in permissions
    ]
    return PermissionMatrixResponse(roles=roles, cells=cells)


@router.put("/permissions/matrix", response_model=PermissionMatrixResponse)
def update_permission_matrix(
    payload: PermissionMatrixUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires superadmin")

    roles_by_key = {r.key: r for r in db.query(Role).all()}
    for item in payload.cells:
        role = roles_by_key.get(item.role_key)
        if role is None:
            raise HTTPException(status_code=400, detail=f"Unknown role_key: {item.role_key}")

        existing = (
            db.query(RolePermission)
            .filter(RolePermission.role_id == role.id, RolePermission.area == item.area)
            .first()
        )
        if existing is None:
            db.add(RolePermission(role_id=role.id, area=item.area, level=item.level))
        else:
            existing.level = item.level

    db.commit()
    return get_permission_matrix(db)
