from sqlalchemy.orm import Session

from models.all_models import Release, ReleaseTestCase


def compute_release_status(results: list[str]) -> str:
    if results and all(r == "Pass" for r in results):
        return "Completed"
    if any(r != "NotRun" for r in results):
        return "InProgress"
    return "New"


def recompute_release_status(db: Session, release: Release) -> None:
    results = [
        row[0]
        for row in db.query(ReleaseTestCase.current_result)
        .filter(ReleaseTestCase.release_id == release.id)
        .all()
    ]
    release.status = compute_release_status(results)
