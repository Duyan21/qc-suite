from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.all_models import Project, Release, Requirement, TestCase, TestRun, TestRunResult, User
from models.base import get_db
from schemas.common import RequirementSummary
from schemas.test_cases import (
    ExecuteTestCaseRequest,
    ExecutionResultResponse,
    TestCaseCreate,
    TestCaseDetailResponse,
    TestCaseExecutionHistoryItem,
    TestCaseListItem,
    TestCaseListResponse,
    TestCaseResponse,
    TestCaseUpdate,
)
from services.auth_service import get_current_user
from services.code_generator import extract_number_suffix, next_child_code
from services.embedding_service import embed_and_store
from services.permissions import PermissionArea, PermissionLevel, check_permission, permitted_project_ids

router = APIRouter(
    prefix="/test-cases",
    tags=["test-cases"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=TestCaseListResponse)
def list_test_cases(
    project_id: int | None = None,
    requirement_id: int | None = None,
    priority: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(TestCase)
    if project_id is not None:
        if db.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="project_id not found")
        check_permission(db, current_user, project_id, PermissionArea.TEST_CASES, PermissionLevel.READ)
        query = query.join(Requirement, TestCase.requirement_id == Requirement.id).filter(
            Requirement.project_id == project_id
        )
    else:
        allowed_ids = permitted_project_ids(db, current_user, PermissionArea.TEST_CASES, PermissionLevel.READ)
        if allowed_ids is not None:  # None means superadmin, no filter
            query = query.join(Requirement, TestCase.requirement_id == Requirement.id).filter(
                Requirement.project_id.in_(allowed_ids)
            )
    if requirement_id is not None:
        query = query.filter(TestCase.requirement_id == requirement_id)
    if priority is not None:
        query = query.filter(TestCase.priority == priority)
    if status_filter is not None:
        query = query.filter(TestCase.status == status_filter)
    else:
        query = query.filter(TestCase.status != "Deprecated")
    if search is not None:
        query = query.filter(
            or_(TestCase.title.ilike(f"%{search}%"), TestCase.code.ilike(f"%{search}%"))
        )

    total = query.count()
    items = (
        query.order_by(TestCase.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    requirement_ids = {tc.requirement_id for tc in items if tc.requirement_id is not None}
    requirements_by_id = {}
    if requirement_ids:
        for req in db.query(Requirement).filter(Requirement.id.in_(requirement_ids)).all():
            requirements_by_id[req.id] = req

    list_items = []
    for tc in items:
        list_item = TestCaseListItem.model_validate(tc)
        req = requirements_by_id.get(tc.requirement_id)
        list_item.requirement = RequirementSummary.model_validate(req) if req else None
        list_items.append(list_item)

    return TestCaseListResponse(items=list_items, total=total, page=page, limit=limit)


@router.post("", response_model=TestCaseResponse, status_code=status.HTTP_201_CREATED)
def create_test_case(
    payload: TestCaseCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requirement = db.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")
    check_permission(db, current_user, requirement.project_id, PermissionArea.TEST_CASES, PermissionLevel.EDIT)

    req_number = extract_number_suffix(requirement.req_id) or "000"

    max_attempts = 5
    for attempt in range(max_attempts):
        code = next_child_code(db, TestCase, "code", "TC", req_number)
        tc = TestCase(
            code=code,
            title=payload.title,
            preconditions=payload.preconditions,
            steps=payload.steps,
            expected_result=payload.expected_result,
            priority=payload.priority,
            requirement_id=payload.requirement_id,
        )
        db.add(tc)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if attempt == max_attempts - 1:
                raise HTTPException(
                    status_code=409,
                    detail="Could not generate a unique test case code, please retry",
                )
            continue
        else:
            break
    db.refresh(tc)
    background_tasks.add_task(embed_and_store, db, tc.id)
    return tc


@router.get("/{id}", response_model=TestCaseDetailResponse)
def get_test_case(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")

    requirement = db.get(Requirement, tc.requirement_id) if tc.requirement_id else None
    if requirement is not None:
        check_permission(db, current_user, requirement.project_id, PermissionArea.TEST_CASES, PermissionLevel.READ)
    elif not current_user.is_superadmin:
        raise HTTPException(
            status_code=403, detail="Cannot access an orphan test case without superadmin access"
        )
    response = TestCaseDetailResponse.model_validate(tc)
    response.requirement = (
        RequirementSummary.model_validate(requirement) if requirement else None
    )
    return response


@router.put("/{id}", response_model=TestCaseResponse)
def update_test_case(
    id: int,
    payload: TestCaseUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")

    # Gate on the test case's CURRENT project too, not just the one it is being
    # moved into — otherwise a user with Edit on project B could rewrite (and
    # read back) a test case belonging to project A simply by re-pointing it.
    current_requirement = db.get(Requirement, tc.requirement_id) if tc.requirement_id else None
    if current_requirement is not None:
        check_permission(
            db, current_user, current_requirement.project_id, PermissionArea.TEST_CASES, PermissionLevel.EDIT
        )
    elif not current_user.is_superadmin:
        raise HTTPException(
            status_code=403, detail="Cannot access an orphan test case without superadmin access"
        )

    requirement = db.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")
    check_permission(db, current_user, requirement.project_id, PermissionArea.TEST_CASES, PermissionLevel.EDIT)

    content_changed = (
        tc.title != payload.title
        or tc.steps != payload.steps
        or tc.expected_result != payload.expected_result
    )

    tc.title = payload.title
    tc.preconditions = payload.preconditions
    tc.steps = payload.steps
    tc.expected_result = payload.expected_result
    tc.priority = payload.priority
    tc.status = payload.status
    tc.requirement_id = payload.requirement_id
    db.commit()
    db.refresh(tc)

    if content_changed:
        background_tasks.add_task(embed_and_store, db, tc.id)

    return tc


@router.delete("/{id}", response_model=TestCaseResponse)
def delete_test_case(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    requirement = db.get(Requirement, tc.requirement_id) if tc.requirement_id else None
    if requirement is not None:
        check_permission(db, current_user, requirement.project_id, PermissionArea.TEST_CASES, PermissionLevel.EDIT)
    elif not current_user.is_superadmin:
        raise HTTPException(
            status_code=403, detail="Cannot access an orphan test case without superadmin access"
        )
    tc.status = "Deprecated"
    db.commit()
    db.refresh(tc)
    return tc


@router.post("/{id}/execute", response_model=ExecutionResultResponse)
def execute_test_case(
    id: int,
    payload: ExecuteTestCaseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    run = db.get(TestRun, payload.run_id)
    if run is None:
        raise HTTPException(status_code=400, detail="run_id not found")
    release = db.get(Release, run.release_id)
    check_permission(db, current_user, release.project_id, PermissionArea.TEST_RUNS, PermissionLevel.EDIT)

    existing = (
        db.query(TestRunResult)
        .filter(
            TestRunResult.run_id == payload.run_id,
            TestRunResult.testcase_id == id,
        )
        .first()
    )
    if existing is not None:
        existing.result = payload.result
        existing.note = payload.note
        db.commit()
        db.refresh(existing)
        return existing

    result_row = TestRunResult(
        run_id=payload.run_id,
        testcase_id=id,
        result=payload.result,
        note=payload.note,
    )
    db.add(result_row)
    db.commit()
    db.refresh(result_row)
    return result_row


@router.get("/{id}/results", response_model=list[TestCaseExecutionHistoryItem])
def get_test_case_results(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    requirement = db.get(Requirement, tc.requirement_id) if tc.requirement_id else None
    if requirement is not None:
        check_permission(db, current_user, requirement.project_id, PermissionArea.TEST_RUNS, PermissionLevel.READ)
    elif not current_user.is_superadmin:
        raise HTTPException(
            status_code=403, detail="Cannot access an orphan test case without superadmin access"
        )

    rows = (
        db.query(TestRunResult, TestRun)
        .join(TestRun, TestRunResult.run_id == TestRun.id)
        .filter(TestRunResult.testcase_id == id)
        .order_by(TestRun.executed_at.desc())
        .all()
    )
    history = []
    for result_row, run in rows:
        release = db.get(Release, run.release_id)
        history.append(
            TestCaseExecutionHistoryItem(
                release_version=release.version_name,
                result=result_row.result,
                executed_at=run.executed_at,
                note=result_row.note,
            )
        )
    return history
