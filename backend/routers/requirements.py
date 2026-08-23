from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.all_models import Module, Project, Requirement, User
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


def _module_name_map(db: Session, requirements: list[Requirement]) -> dict[int, str]:
    module_ids = {r.module_id for r in requirements if r.module_id is not None}
    if not module_ids:
        return {}
    modules = db.query(Module).filter(Module.id.in_(module_ids)).all()
    return {m.id: m.name for m in modules}


def _requirement_response(req: Requirement, module_name: str | None) -> RequirementResponse:
    return RequirementResponse(
        id=req.id,
        req_id=req.req_id,
        version=req.version,
        title=req.title,
        description=req.description,
        module_id=req.module_id,
        module_name=module_name,
        status=req.status,
        is_current=req.is_current,
        change_note=req.change_note,
        changed_by=req.changed_by,
        previous_version_id=req.previous_version_id,
        project_id=req.project_id,
        created_at=req.created_at,
    )


def _validate_module(db: Session, module_id: int, project_id: int) -> Module:
    module = db.get(Module, module_id)
    if module is None or module.project_id != project_id:
        raise HTTPException(status_code=400, detail="module_id not found for this project")
    return module


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
    name_map = _module_name_map(db, items)
    return RequirementListResponse(
        items=[_requirement_response(r, name_map.get(r.module_id)) for r in items],
        total=total,
        page=page,
        limit=limit,
    )


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
    module_name = None
    if req.module_id is not None:
        module = db.get(Module, req.module_id)
        module_name = module.name if module else None
    return _requirement_response(req, module_name)


@router.post("", response_model=RequirementResponse, status_code=status.HTTP_201_CREATED)
def create_requirement(
    payload: RequirementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=400, detail="project_id not found")
    check_permission(db, current_user, payload.project_id, PermissionArea.REQUIREMENTS, PermissionLevel.EDIT)
    module = _validate_module(db, payload.module_id, payload.project_id)

    req_id = next_code(db, Requirement, "req_id", "REQ")
    req = Requirement(
        req_id=req_id,
        version=1,
        title=payload.title,
        description=payload.description,
        module_id=module.id,
        status=payload.status,
        is_current=True,
        project_id=payload.project_id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _requirement_response(req, module.name)


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
    module = _validate_module(db, payload.module_id, old.project_id)

    old.is_current = False

    new = Requirement(
        req_id=old.req_id,
        version=old.version + 1,
        title=payload.title,
        description=payload.description,
        module_id=module.id,
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
    return _requirement_response(new, module.name)


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
        module_id=old.module_id,
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
    module_name = None
    if new.module_id is not None:
        module = db.get(Module, new.module_id)
        module_name = module.name if module else None
    return _requirement_response(new, module_name)


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
    name_map = _module_name_map(db, versions)
    return [_requirement_response(v, name_map.get(v.module_id)) for v in versions]
