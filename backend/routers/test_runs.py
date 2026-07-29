from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Release, TestRun
from models.base import get_db
from schemas.test_runs import TestRunCreate, TestRunResponse
from services.auth_service import get_current_user

router = APIRouter(
    prefix="/test-runs",
    tags=["test-runs"],
    dependencies=[Depends(get_current_user)],
)


def _to_response(run: TestRun, release_version: str) -> TestRunResponse:
    return TestRunResponse(
        id=run.id,
        release_id=run.release_id,
        release_version=release_version,
        executed_at=run.executed_at,
        executed_by=run.executed_by,
        note=run.note,
    )


@router.post("", response_model=TestRunResponse, status_code=status.HTTP_201_CREATED)
def create_test_run(payload: TestRunCreate, db: Session = Depends(get_db)):
    release = db.get(Release, payload.release_id)
    if release is None:
        raise HTTPException(status_code=400, detail="release_id not found")

    run = TestRun(
        release_id=payload.release_id,
        executed_by=payload.executed_by,
        note=payload.note,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_response(run, release.version_name)


@router.get("", response_model=list[TestRunResponse])
def list_test_runs(release_id: int = Query(...), db: Session = Depends(get_db)):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")

    runs = (
        db.query(TestRun)
        .filter(TestRun.release_id == release_id)
        .order_by(TestRun.executed_at.desc())
        .all()
    )
    return [_to_response(r, release.version_name) for r in runs]
