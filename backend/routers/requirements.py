from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.all_models import Project, Requirement, User
from models.base import get_db
from schemas.requirements import (
    RequirementCreate,
    RequirementListResponse,
    RequirementResponse,
    RequirementUpdate,
)
from services.auth_service import get_current_user
from services.code_generator import next_code
from services.permissions import PermissionArea, PermissionLevel, check_permission, require_permission

router = APIRouter(
    prefix="/requirements",
    tags=["requirements"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=RequirementListResponse)
def list_requirements(
    project_id: int = Query(...),
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _permission: None = Depends(require_permission(PermissionArea.REQUIREMENTS, PermissionLevel.READ)),
):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="project_id not found")

    query = db.query(Requirement).filter(
        Requirement.project_id == project_id, Requirement.is_current == True
    )
    if status_filter is not None:
        query = query.filter(Requirement.status == status_filter)
    else:
        query = query.filter(Requirement.status != "Deprecated")
    if search is not None:
        query = query.filter(
            or_(
                Requirement.title.ilike(f"%{search}%"),
                Requirement.req_id.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    items = (
        query.order_by(Requirement.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return RequirementListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/{id}", response_model=RequirementResponse)
def get_requirement(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.get(Requirement, id)
    if req is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    check_permission(db, current_user, req.project_id, PermissionArea.REQUIREMENTS, PermissionLevel.READ)
    return req


@router.post("", response_model=RequirementResponse, status_code=status.HTTP_201_CREATED)
def create_requirement(
    payload: RequirementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=400, detail="project_id not found")
    check_permission(db, current_user, payload.project_id, PermissionArea.REQUIREMENTS, PermissionLevel.EDIT)

    req_id = next_code(db, Requirement, "req_id", "REQ")
    req = Requirement(
        req_id=req_id,
        version=1,
        title=payload.title,
        description=payload.description,
        module=payload.module,
        status=payload.status,
        is_current=True,
        project_id=payload.project_id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.put("/{id}", response_model=RequirementResponse)
def update_requirement(
    id: int,
    payload: RequirementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old = db.get(Requirement, id)
    if old is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if not old.is_current:
        raise HTTPException(status_code=400, detail="Requirement is not the current version")
    check_permission(db, current_user, old.project_id, PermissionArea.REQUIREMENTS, PermissionLevel.EDIT)

    old.is_current = False

    new = Requirement(
        req_id=old.req_id,
        version=old.version + 1,
        title=payload.title,
        description=payload.description,
        module=old.module,
        status=payload.status,
        is_current=True,
        change_note=payload.change_note,
        changed_by=current_user.email,
        previous_version_id=old.id,
        project_id=old.project_id,
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return new


@router.delete("/{id}", response_model=RequirementResponse)
def delete_requirement(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old = db.get(Requirement, id)
    if old is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if not old.is_current:
        raise HTTPException(status_code=400, detail="Requirement is not the current version")
    check_permission(db, current_user, old.project_id, PermissionArea.REQUIREMENTS, PermissionLevel.EDIT)

    old.is_current = False

    new = Requirement(
        req_id=old.req_id,
        version=old.version + 1,
        title=old.title,
        description=old.description,
        module=old.module,
        status="Deprecated",
        is_current=True,
        change_note=None,
        changed_by=current_user.email,
        previous_version_id=old.id,
        project_id=old.project_id,
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return new


@router.get("/{req_id}/history", response_model=list[RequirementResponse])
def get_requirement_history(
    req_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    versions = (
        db.query(Requirement)
        .filter(Requirement.req_id == req_id)
        .order_by(Requirement.version)
        .all()
    )
    if not versions:
        raise HTTPException(status_code=404, detail="Requirement not found")
    check_permission(db, current_user, versions[0].project_id, PermissionArea.REQUIREMENTS, PermissionLevel.READ)
    return versions
