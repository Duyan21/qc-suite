from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from models.all_models import Project, ProjectMember, Role, User
from models.base import get_db
from schemas.members import MemberInviteRequest, MemberResponse, MemberUpdateRequest
from schemas.projects import ProjectCreate, ProjectResponse, ProjectUpdate
from services.auth_service import get_current_user
from services.permissions import (
    PermissionArea,
    PermissionLevel,
    check_permission,
    is_project_member,
)

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    dependencies=[Depends(get_current_user)],
)


def _generate_project_key(db: Session, name: str) -> str:
    base_key = "".join(w[0] for w in name.split() if w)[:6].upper() or "PRJ"
    candidate = base_key
    suffix = 1
    while db.query(Project).filter(Project.key == candidate).first() is not None:
        suffix += 1
        candidate = f"{base_key}{suffix}"
    return candidate


def _is_last_admin(db: Session, membership: ProjectMember) -> bool:
    """True when `membership` is an admin-role membership and no OTHER admin
    membership exists for the same project — i.e. demoting or removing it would
    leave the project with zero admins and orphan its member management."""
    admin_role = db.query(Role).filter(Role.key == "admin").first()
    if admin_role is None or membership.role_id != admin_role.id:
        return False

    other_admins = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == membership.project_id,
            ProjectMember.role_id == admin_role.id,
            ProjectMember.user_id != membership.user_id,
        )
        .count()
    )
    return other_admins == 0


def _member_response(db: Session, membership: ProjectMember) -> MemberResponse:
    user = db.get(User, membership.user_id)
    role = db.get(Role, membership.role_id)
    return MemberResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        status=user.status,
        role_key=role.key,
        role_name=role.name,
        joined_at=membership.created_at,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (current_user.is_superadmin or current_user.can_create_projects):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires can_create_projects or superadmin",
        )

    project = Project(
        name=payload.name,
        description=payload.description,
        key=_generate_project_key(db, payload.name),
    )
    db.add(project)
    db.flush()

    admin_role = db.query(Role).filter(Role.key == "admin").one()
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role_id=admin_role.id))

    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.is_superadmin:
        return db.query(Project).order_by(Project.id).all()
    return (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == current_user.id)
        .order_by(Project.id)
        .all()
    )


@router.get("/{id}", response_model=ProjectResponse)
def get_project(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.get(Project, id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not is_project_member(db, current_user, id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project",
        )
    return project


@router.put("/{id}", response_model=ProjectResponse)
def update_project(
    id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.get(Project, id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    check_permission(db, current_user, id, PermissionArea.PROJECT_SETTINGS, PermissionLevel.EDIT)

    if payload.key != project.key:
        existing = db.query(Project).filter(Project.key == payload.key, Project.id != id).first()
        if existing is not None:
            raise HTTPException(
                status_code=400, detail=f"Project key '{payload.key}' is already in use"
            )

    for field, value in payload.model_dump().items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)
    return project


@router.get("/{id}/members", response_model=list[MemberResponse])
def list_members(
    id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if db.get(Project, id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not is_project_member(db, current_user, id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project",
        )

    memberships = db.query(ProjectMember).filter(ProjectMember.project_id == id).all()
    return [_member_response(db, m) for m in memberships]


@router.post("/{id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    id: int,
    payload: MemberInviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.get(Project, id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    check_permission(db, current_user, id, PermissionArea.MEMBERS_ROLES, PermissionLevel.EDIT)

    role = db.query(Role).filter(Role.key == payload.role_key).first()
    if role is None:
        raise HTTPException(status_code=400, detail="Unknown role_key")

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        user = User(
            email=payload.email,
            hashed_password="",
            full_name=payload.full_name,
            status="Invited",
        )
        db.add(user)
        db.flush()

    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == id, ProjectMember.user_id == user.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    membership = ProjectMember(project_id=id, user_id=user.id, role_id=role.id)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return _member_response(db, membership)


@router.patch("/{id}/members/{user_id}", response_model=MemberResponse)
def update_member(
    id: int,
    user_id: int,
    payload: MemberUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_permission(db, current_user, id, PermissionArea.MEMBERS_ROLES, PermissionLevel.EDIT)

    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == id, ProjectMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")

    if payload.role_key is not None:
        role = db.query(Role).filter(Role.key == payload.role_key).first()
        if role is None:
            raise HTTPException(status_code=400, detail="Unknown role_key")
        if role.id != membership.role_id and _is_last_admin(db, membership):
            raise HTTPException(
                status_code=400, detail="Cannot remove the last admin of a project"
            )
        membership.role_id = role.id

    if payload.status is not None:
        user = db.get(User, user_id)
        user.status = payload.status

    db.commit()
    db.refresh(membership)
    return _member_response(db, membership)


@router.delete("/{id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_permission(db, current_user, id, PermissionArea.MEMBERS_ROLES, PermissionLevel.EDIT)

    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == id, ProjectMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    if _is_last_admin(db, membership):
        raise HTTPException(status_code=400, detail="Cannot remove the last admin of a project")

    db.delete(membership)
    db.commit()
