from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Project, Release, ReleaseTestCase, Requirement, TestCase, User
from models.base import get_db
from schemas.common import RequirementSummary
from schemas.releases import (
    AddTestCasesRequest,
    ReleaseCreate,
    ReleaseResponse,
    ReleaseStatusUpdate,
    ReleaseTestCaseItem,
    ReleaseTestCaseTestCase,
)
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


def _rtc_item(rtc: ReleaseTestCase, tc: TestCase, requirement: Requirement | None, added_by_user: User | None) -> ReleaseTestCaseItem:
    return ReleaseTestCaseItem(
        id=rtc.id,
        testcase=ReleaseTestCaseTestCase(
            id=tc.id, code=tc.code, title=tc.title, priority=tc.priority, status=tc.status,
            requirement=RequirementSummary.model_validate(requirement) if requirement else None,
        ),
        current_result=rtc.current_result,
        added_by_name=_display_name(added_by_user),
        added_at=rtc.added_at,
    )


def _release_test_case_rows_response(db: Session, release_id: int, testcase_ids: set[int]) -> list[ReleaseTestCaseItem]:
    rows = (
        db.query(ReleaseTestCase, TestCase)
        .join(TestCase, ReleaseTestCase.testcase_id == TestCase.id)
        .filter(ReleaseTestCase.release_id == release_id, ReleaseTestCase.testcase_id.in_(testcase_ids))
        .all()
        if testcase_ids
        else []
    )
    requirement_ids = {tc.requirement_id for _, tc in rows if tc.requirement_id is not None}
    requirements_by_id = (
        {r.id: r for r in db.query(Requirement).filter(Requirement.id.in_(requirement_ids)).all()}
        if requirement_ids
        else {}
    )
    user_ids = {rtc.added_by for rtc, _ in rows if rtc.added_by is not None}
    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [
        _rtc_item(rtc, tc, requirements_by_id.get(tc.requirement_id), users_by_id.get(rtc.added_by))
        for rtc, tc in rows
    ]


@router.get("/{release_id}/test-cases", response_model=list[ReleaseTestCaseItem])
def list_release_test_cases(release_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.READ)

    all_ids = {
        tc_id for (tc_id,) in db.query(ReleaseTestCase.testcase_id).filter(ReleaseTestCase.release_id == release_id).all()
    }
    return _release_test_case_rows_response(db, release_id, all_ids)


@router.post("/{release_id}/test-cases", response_model=list[ReleaseTestCaseItem], status_code=status.HTTP_201_CREATED)
def add_release_test_cases(
    release_id: int,
    payload: AddTestCasesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.EDIT)

    testcase_ids = set(payload.testcase_ids or [])
    if payload.requirement_ids:
        linked = (
            db.query(TestCase.id)
            .filter(TestCase.requirement_id.in_(payload.requirement_ids), TestCase.status != "Deprecated")
            .all()
        )
        testcase_ids.update(tc_id for (tc_id,) in linked)

    if not testcase_ids:
        raise HTTPException(status_code=400, detail="No test cases resolved to add")

    existing_ids = {
        tc_id
        for (tc_id,) in db.query(ReleaseTestCase.testcase_id)
        .filter(ReleaseTestCase.release_id == release_id, ReleaseTestCase.testcase_id.in_(testcase_ids))
        .all()
    }
    new_ids = testcase_ids - existing_ids

    for tc_id in new_ids:
        db.add(ReleaseTestCase(release_id=release_id, testcase_id=tc_id, added_by=current_user.id))
    db.flush()

    recompute_release_status(db, release)
    db.commit()

    return _release_test_case_rows_response(db, release_id, new_ids)


@router.delete("/{release_id}/test-cases/{testcase_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_release_test_case(
    release_id: int,
    testcase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.EDIT)

    rtc = (
        db.query(ReleaseTestCase)
        .filter(ReleaseTestCase.release_id == release_id, ReleaseTestCase.testcase_id == testcase_id)
        .first()
    )
    if rtc is None:
        raise HTTPException(status_code=404, detail="Test case not in this release")

    from models.all_models import ExecutionEvidenceImage, ReleaseTestCaseExecution

    execution_ids = [
        e.id for e in db.query(ReleaseTestCaseExecution).filter(ReleaseTestCaseExecution.release_test_case_id == rtc.id).all()
    ]
    if execution_ids:
        db.query(ExecutionEvidenceImage).filter(ExecutionEvidenceImage.execution_id.in_(execution_ids)).delete(synchronize_session=False)
        db.query(ReleaseTestCaseExecution).filter(ReleaseTestCaseExecution.id.in_(execution_ids)).delete(synchronize_session=False)
    db.delete(rtc)
    db.flush()

    recompute_release_status(db, release)
    db.commit()
