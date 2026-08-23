from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.all_models import Defect, Module, Project, Requirement, TestCase, User
from models.base import get_db
from schemas.modules import ModuleCreate, ModuleResponse, ModuleUpdate
from services.auth_service import get_current_user
from services.permissions import PermissionArea, PermissionLevel, check_permission, is_project_member

router = APIRouter(prefix="/projects", tags=["modules"], dependencies=[Depends(get_current_user)])

ACTIVE_REQUIREMENT_STATUSES = ("Draft", "Active")
ACTIVE_TEST_CASE_STATUSES = ("Draft", "Active")
ACTIVE_DEFECT_STATUSES = ("Open", "Fixed")


def _get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _get_module_or_404(db: Session, project_id: int, module_id: int) -> Module:
    module = (
        db.query(Module)
        .filter(Module.id == module_id, Module.project_id == project_id)
        .first()
    )
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    return module


def _validate_name(db: Session, project_id: int, name: str, exclude_module_id: int | None = None) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Module name is required")

    duplicate_query = db.query(Module).filter(
        Module.project_id == project_id,
        func.lower(Module.name) == cleaned.lower(),
    )
    if exclude_module_id is not None:
        duplicate_query = duplicate_query.filter(Module.id != exclude_module_id)
    if duplicate_query.first() is not None:
        raise HTTPException(status_code=400, detail="A module with this name already exists")

    return cleaned


def _count_active_connections(db: Session, module: Module) -> int:
    req_ids = [
        r.id for r in db.query(Requirement.id).filter(Requirement.module_id == module.id)
    ]

    active_req_count = (
        db.query(Requirement)
        .filter(Requirement.module_id == module.id, Requirement.status.in_(ACTIVE_REQUIREMENT_STATUSES))
        .count()
        if req_ids
        else 0
    )

    tc_ids: list[int] = []
    active_tc_count = 0
    if req_ids:
        test_cases = db.query(TestCase).filter(TestCase.requirement_id.in_(req_ids)).all()
        tc_ids = [tc.id for tc in test_cases]
        active_tc_count = sum(1 for tc in test_cases if tc.status in ACTIVE_TEST_CASE_STATUSES)

    active_defect_count = 0
    if req_ids or tc_ids:
        conditions = []
        if req_ids:
            conditions.append(Defect.requirement_id.in_(req_ids))
        if tc_ids:
            conditions.append(Defect.testcase_id.in_(tc_ids))
        active_defect_count = (
            db.query(Defect)
            .filter(Defect.status.in_(ACTIVE_DEFECT_STATUSES), or_(*conditions))
            .count()
        )

    return active_req_count + active_tc_count + active_defect_count


@router.get("/{id}/modules", response_model=list[ModuleResponse])
def list_modules(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_project_or_404(db, id)
    if not is_project_member(db, current_user, id):
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return db.query(Module).filter(Module.project_id == id).order_by(Module.name).all()


@router.post("/{id}/modules", response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)
def create_module(
    id: int,
    payload: ModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_project_or_404(db, id)
    check_permission(db, current_user, id, PermissionArea.PROJECT_SETTINGS, PermissionLevel.EDIT)
    name = _validate_name(db, id, payload.name)

    module = Module(project_id=id, name=name)
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


@router.patch("/{id}/modules/{module_id}", response_model=ModuleResponse)
def update_module(
    id: int,
    module_id: int,
    payload: ModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_project_or_404(db, id)
    check_permission(db, current_user, id, PermissionArea.PROJECT_SETTINGS, PermissionLevel.EDIT)
    module = _get_module_or_404(db, id, module_id)
    module.name = _validate_name(db, id, payload.name, exclude_module_id=module.id)

    db.commit()
    db.refresh(module)
    return module


@router.delete("/{id}/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    id: int,
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_project_or_404(db, id)
    check_permission(db, current_user, id, PermissionArea.PROJECT_SETTINGS, PermissionLevel.EDIT)
    module = _get_module_or_404(db, id, module_id)

    blocking = _count_active_connections(db, module)
    if blocking > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot remove module: {blocking} active item(s) still linked. "
                "Close or reassign them first."
            ),
        )

    # Nullify module_id on all non-active requirements before deleting
    db.query(Requirement).filter(
        Requirement.module_id == module.id,
        ~Requirement.status.in_(ACTIVE_REQUIREMENT_STATUSES)
    ).update({Requirement.module_id: None})

    db.delete(module)
    db.commit()
