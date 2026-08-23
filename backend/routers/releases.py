from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Project, Release, User
from models.base import get_db
from schemas.releases import ReleaseCreate, ReleaseResponse
from services.auth_service import get_current_user
from services.permissions import (
    PermissionArea,
    PermissionLevel,
    check_permission,
    is_project_member,
)

router = APIRouter(
    prefix="/releases",
    tags=["releases"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=ReleaseResponse, status_code=status.HTTP_201_CREATED)
def create_release(payload: ReleaseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=400, detail="project_id not found")
    check_permission(db, current_user, payload.project_id, PermissionArea.TEST_RUNS, PermissionLevel.EDIT)

    release = Release(
        project_id=payload.project_id,
        version_name=payload.version_name,
        note=payload.note,
    )
    db.add(release)
    db.commit()
    db.refresh(release)
    return release


@router.get("", response_model=list[ReleaseResponse])
def list_releases(
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not is_project_member(db, current_user, project_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project",
        )

    return (
        db.query(Release)
        .filter(Release.project_id == project_id)
        .order_by(Release.created_at.desc())
        .all()
    )
