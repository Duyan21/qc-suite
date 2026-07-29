from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Release, Requirement, TestCase, TestRun, TestRunResult
from models.base import get_db
from schemas.common import RequirementSummary
from schemas.test_cases import (
    ExecuteTestCaseRequest,
    ExecutionResultResponse,
    TestCaseCreate,
    TestCaseDetailResponse,
    TestCaseExecutionHistoryItem,
    TestCaseListResponse,
    TestCaseResponse,
    TestCaseUpdate,
)
from services.auth_service import get_current_user
from services.code_generator import next_code
from services.embedding_service import trigger_embedding

router = APIRouter(
    prefix="/test-cases",
    tags=["test-cases"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=TestCaseListResponse)
def list_test_cases(
    requirement_id: int | None = None,
    priority: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(TestCase)
    if requirement_id is not None:
        query = query.filter(TestCase.requirement_id == requirement_id)
    if priority is not None:
        query = query.filter(TestCase.priority == priority)
    if status_filter is not None:
        query = query.filter(TestCase.status == status_filter)

    total = query.count()
    items = (
        query.order_by(TestCase.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return TestCaseListResponse(items=items, total=total, page=page, limit=limit)


@router.post("", response_model=TestCaseResponse, status_code=status.HTTP_201_CREATED)
def create_test_case(payload: TestCaseCreate, db: Session = Depends(get_db)):
    requirement = db.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")

    code = next_code(db, TestCase, "code", "TC")
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
    db.commit()
    db.refresh(tc)
    trigger_embedding(tc)
    return tc


@router.get("/{id}", response_model=TestCaseDetailResponse)
def get_test_case(id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")

    requirement = db.get(Requirement, tc.requirement_id) if tc.requirement_id else None
    response = TestCaseDetailResponse.model_validate(tc)
    response.requirement = (
        RequirementSummary.model_validate(requirement) if requirement else None
    )
    return response


@router.put("/{id}", response_model=TestCaseResponse)
def update_test_case(id: int, payload: TestCaseUpdate, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    requirement = db.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")

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
        trigger_embedding(tc)

    return tc


@router.delete("/{id}", response_model=TestCaseResponse)
def delete_test_case(id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    tc.status = "Deprecated"
    db.commit()
    db.refresh(tc)
    return tc


@router.post("/{id}/execute", response_model=ExecutionResultResponse)
def execute_test_case(id: int, payload: ExecuteTestCaseRequest, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    run = db.get(TestRun, payload.run_id)
    if run is None:
        raise HTTPException(status_code=400, detail="run_id not found")

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
def get_test_case_results(id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")

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
