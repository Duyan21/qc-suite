from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Project, Release
from models.base import get_db
from schemas.releases import ReleaseCreate, ReleaseResponse
from services.auth_service import get_current_user

router = APIRouter(
    prefix="/releases",
    tags=["releases"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=ReleaseResponse, status_code=status.HTTP_201_CREATED)
def create_release(payload: ReleaseCreate, db: Session = Depends(get_db)):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=400, detail="project_id not found")

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
def list_releases(project_id: int = Query(...), db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return (
        db.query(Release)
        .filter(Release.project_id == project_id)
        .order_by(Release.created_at.desc())
        .all()
    )
