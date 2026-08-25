from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Project, Release, ReleaseTestCase, User
from models.base import get_db
from schemas.releases import ReleaseCreate, ReleaseResponse, ReleaseStatusUpdate
from services.auth_service import get_current_user
from services.permissions import (
    PermissionArea,
    PermissionLevel,
    check_permission,
    is_project_member,
)
from services.release_status import recompute_release_status

router = APIRouter(
    prefix="/releases",
    tags=["releases"],
    dependencies=[Depends(get_current_user)],
)


def _display_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.email


def _release_response(db: Session, release: Release) -> ReleaseResponse:
    results = [
        row[0]
        for row in db.query(ReleaseTestCase.current_result)
        .filter(ReleaseTestCase.release_id == release.id)
        .all()
    ]
    owner = db.get(User, release.owner_user_id) if release.owner_user_id else None
    return ReleaseResponse(
        id=release.id,
        project_id=release.project_id,
        version_name=release.version_name,
        note=release.note,
        status=release.status,
        target_date=release.target_date,
        owner_user_id=release.owner_user_id,
        owner_name=_display_name(owner),
        created_at=release.created_at,
        total_test_cases=len(results),
        pass_count=sum(1 for r in results if r == "Pass"),
        fail_count=sum(1 for r in results if r == "Fail"),
        not_run_count=sum(1 for r in results if r == "NotRun"),
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
        target_date=payload.target_date,
        owner_user_id=payload.owner_user_id if payload.owner_user_id is not None else current_user.id,
    )
    db.add(release)
    db.commit()
    db.refresh(release)
    return _release_response(db, release)


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

    releases = (
        db.query(Release)
        .filter(Release.project_id == project_id)
        .order_by(Release.created_at.desc())
        .all()
    )
    return [_release_response(db, r) for r in releases]


@router.get("/{release_id}", response_model=ReleaseResponse)
def get_release(release_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.READ)
    return _release_response(db, release)


@router.patch("/{release_id}/status", response_model=ReleaseResponse)
def update_release_status(
    release_id: int,
    payload: ReleaseStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.FULL)
    release.status = payload.status
    db.commit()
    db.refresh(release)
    return _release_response(db, release)
