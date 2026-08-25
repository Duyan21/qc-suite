from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.all_models import Module, Project, Requirement, ReleaseTestCase, ReleaseTestCaseExecution, TestCase
from models.base import get_db
from schemas.traceability import (
    TraceabilityRequirementItem,
    TraceabilityResponse,
    TraceabilityTestCaseItem,
)
from services.auth_service import get_current_user
from services.permissions import PermissionArea, PermissionLevel, require_permission

router = APIRouter(
    prefix="/traceability",
    tags=["traceability"],
    dependencies=[Depends(get_current_user)],
)


def _status_for_result(result: str | None) -> str:
    if result == "Pass":
        return "covered"
    if result == "Fail":
        return "failed"
    if result is None:
        return "not_run"
    return "skipped"


@router.get("", response_model=TraceabilityResponse)
def get_traceability(
    project_id: int = Query(...),
    release_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _permission: None = Depends(require_permission(PermissionArea.REQUIREMENTS, PermissionLevel.READ)),
):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="project_id not found")

    requirements = (
        db.query(Requirement)
        .filter(Requirement.project_id == project_id, Requirement.is_current == True)
        .order_by(Requirement.id)
        .all()
    )

    module_ids = {r.module_id for r in requirements if r.module_id is not None}
    module_name_by_id: dict[int, str] = {}
    if module_ids:
        module_name_by_id = {
            m.id: m.name for m in db.query(Module).filter(Module.id.in_(module_ids)).all()
        }
    requirements.sort(key=lambda r: (module_name_by_id.get(r.module_id) is None, module_name_by_id.get(r.module_id, ""), r.id))

    requirement_ids = [r.id for r in requirements]

    test_cases = (
        db.query(TestCase)
        .filter(
            TestCase.requirement_id.in_(requirement_ids),
            TestCase.status != "Deprecated",
        )
        .order_by(TestCase.id)
        .all()
        if requirement_ids
        else []
    )
    test_case_ids = [tc.id for tc in test_cases]

    latest_by_tc: dict[int, tuple[str | None, int, object]] = {}
    if test_case_ids:
        result_query = (
            db.query(
                ReleaseTestCase.testcase_id.label("testcase_id"),
                ReleaseTestCaseExecution.result.label("result"),
                ReleaseTestCaseExecution.id.label("execution_id"),
                ReleaseTestCaseExecution.executed_at.label("executed_at"),
                func.row_number()
                .over(
                    partition_by=ReleaseTestCase.testcase_id,
                    # Postgres func.now() is stable within a transaction, so
                    # executed_at alone can tie for executions created in the
                    # same transaction (e.g. test fixtures). Break ties with
                    # the execution id, which is monotonically increasing.
                    order_by=(ReleaseTestCaseExecution.executed_at.desc(), ReleaseTestCaseExecution.id.desc()),
                )
                .label("rn"),
            )
            .join(ReleaseTestCaseExecution, ReleaseTestCaseExecution.release_test_case_id == ReleaseTestCase.id)
            .filter(ReleaseTestCase.testcase_id.in_(test_case_ids))
        )
        if release_id is not None:
            result_query = result_query.filter(ReleaseTestCase.release_id == release_id)
        ranked = result_query.subquery()
        latest_rows = (
            db.query(ranked.c.testcase_id, ranked.c.result, ranked.c.execution_id, ranked.c.executed_at)
            .filter(ranked.c.rn == 1)
            .all()
        )
        latest_by_tc = {
            row.testcase_id: (row.result, row.execution_id, row.executed_at) for row in latest_rows
        }

    tc_by_requirement: dict[int, list[TestCase]] = defaultdict(list)
    for tc in test_cases:
        tc_by_requirement[tc.requirement_id].append(tc)

    items = []
    for req in requirements:
        linked = tc_by_requirement.get(req.id, [])
        tc_items = []
        for tc in linked:
            result, execution_id, executed_at = latest_by_tc.get(tc.id, (None, None, None))
            tc_items.append(
                TraceabilityTestCaseItem(
                    id=tc.id,
                    code=tc.code,
                    title=tc.title,
                    status=_status_for_result(result),
                    execution_id=execution_id,
                    executed_at=executed_at,
                )
            )
        covered_count = sum(1 for item in tc_items if item.status == "covered")
        total = len(tc_items)
        items.append(
            TraceabilityRequirementItem(
                id=req.id,
                req_id=req.req_id,
                version=req.version,
                title=req.title,
                module=module_name_by_id.get(req.module_id),
                status=req.status,
                is_uncovered=(total == 0),
                coverage_percent=(covered_count / total) if total else 0.0,
                test_cases=tc_items,
            )
        )

    return TraceabilityResponse(items=items)
