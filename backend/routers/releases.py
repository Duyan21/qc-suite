from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from models.all_models import (
    ExecutionEvidenceImage,
    Project,
    Release,
    ReleaseTestCase,
    ReleaseTestCaseExecution,
    Requirement,
    TestCase,
    User,
)
from models.base import get_db
from schemas.common import RequirementSummary
from schemas.releases import (
    AddTestCasesRequest,
    EvidenceImageItem,
    ExecutionHistoryItem,
    ReleaseCreate,
    ReleaseResponse,
    ReleaseStatusUpdate,
    ReleaseTestCaseItem,
    ReleaseTestCaseTestCase,
)
from services.auth_service import get_current_user
from services.evidence_storage import validate_evidence_image, write_evidence_image
from services.permissions import (
    PermissionArea,
    PermissionLevel,
    check_permission,
    is_project_member,
)
from services.release_status import recompute_release_status

MAX_IMAGES_PER_EXECUTION = 10

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

    # Both resolution paths are scoped to the release's own project (via
    # TestCase -> Requirement.project_id). Without this, any user with `edit`
    # on ANY project could add another project's test cases to their release
    # and read them back through GET /releases/{id}/test-cases, bypassing the
    # project-scoped read gates in routers/test_cases.py and requirements.py.
    # Out-of-project (and nonexistent) ids are silently dropped rather than
    # 404'd, so the response never confirms that an id exists elsewhere.
    testcase_ids: set[int] = set()
    if payload.testcase_ids:
        scoped = (
            db.query(TestCase.id)
            .join(Requirement, TestCase.requirement_id == Requirement.id)
            .filter(
                TestCase.id.in_(payload.testcase_ids),
                Requirement.project_id == release.project_id,
            )
            .all()
        )
        testcase_ids.update(tc_id for (tc_id,) in scoped)
    if payload.requirement_ids:
        linked = (
            db.query(TestCase.id)
            .join(Requirement, TestCase.requirement_id == Requirement.id)
            .filter(
                TestCase.requirement_id.in_(payload.requirement_ids),
                TestCase.status != "Deprecated",
                Requirement.project_id == release.project_id,
            )
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


@router.post(
    "/{release_id}/test-cases/{testcase_id}/execute",
    response_model=ExecutionHistoryItem,
    status_code=status.HTTP_201_CREATED,
)
def execute_release_test_case(
    release_id: int,
    testcase_id: int,
    result: Literal["Pass", "Fail"] = Form(...),
    note: str | None = Form(None),
    images: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.EDIT)

    if len(images) > MAX_IMAGES_PER_EXECUTION:
        raise HTTPException(status_code=400, detail=f"Too many images (max {MAX_IMAGES_PER_EXECUTION})")

    rtc = (
        db.query(ReleaseTestCase)
        .filter(ReleaseTestCase.release_id == release_id, ReleaseTestCase.testcase_id == testcase_id)
        .first()
    )
    if rtc is None:
        raise HTTPException(status_code=400, detail="Test case not in this release")

    # Validate the whole batch before writing any of it: a mid-batch 400 used
    # to leave the already-written files orphaned on disk with no DB row,
    # since the request was rolled back afterwards.
    validated = [validate_evidence_image(upload) for upload in images]

    execution = ReleaseTestCaseExecution(release_test_case_id=rtc.id, result=result, note=note, executed_by=current_user.id)
    db.add(execution)
    db.flush()

    for data, ext in validated:
        write_evidence_image(db, execution.id, release_id, testcase_id, data, ext)

    rtc.current_result = result
    db.flush()
    recompute_release_status(db, release)
    db.commit()
    db.refresh(execution)

    image_rows = db.query(ExecutionEvidenceImage).filter(ExecutionEvidenceImage.execution_id == execution.id).all()
    return ExecutionHistoryItem(
        id=execution.id,
        result=execution.result,
        note=execution.note,
        executed_by_name=_display_name(current_user),
        executed_at=execution.executed_at,
        images=[EvidenceImageItem(id=i.id, url=f"/uploads{i.file_path}") for i in image_rows],
    )


@router.get("/{release_id}/test-cases/{testcase_id}/executions", response_model=list[ExecutionHistoryItem])
def list_release_test_case_executions(
    release_id: int,
    testcase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.READ)

    rtc = (
        db.query(ReleaseTestCase)
        .filter(ReleaseTestCase.release_id == release_id, ReleaseTestCase.testcase_id == testcase_id)
        .first()
    )
    if rtc is None:
        raise HTTPException(status_code=404, detail="Test case not in this release")

    executions = (
        db.query(ReleaseTestCaseExecution)
        .filter(ReleaseTestCaseExecution.release_test_case_id == rtc.id)
        .order_by(ReleaseTestCaseExecution.executed_at.desc(), ReleaseTestCaseExecution.id.desc())
        .all()
    )
    user_ids = {e.executed_by for e in executions if e.executed_by is not None}
    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    exec_ids = [e.id for e in executions]
    images_by_exec: dict[int, list] = {}
    if exec_ids:
        for img in db.query(ExecutionEvidenceImage).filter(ExecutionEvidenceImage.execution_id.in_(exec_ids)).all():
            images_by_exec.setdefault(img.execution_id, []).append(img)

    return [
        ExecutionHistoryItem(
            id=e.id,
            result=e.result,
            note=e.note,
            executed_by_name=_display_name(users_by_id.get(e.executed_by)),
            executed_at=e.executed_at,
            images=[EvidenceImageItem(id=i.id, url=f"/uploads{i.file_path}") for i in images_by_exec.get(e.id, [])],
        )
        for e in executions
    ]
