from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.all_models import Project, Requirement, TestCase, TestRun, TestRunResult
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
                TestRunResult.testcase_id.label("testcase_id"),
                TestRunResult.result.label("result"),
                TestRun.id.label("run_id"),
                TestRun.executed_at.label("executed_at"),
                func.row_number()
                .over(
                    partition_by=TestRunResult.testcase_id,
                    # Postgres func.now() is stable within a transaction, so
                    # executed_at alone can tie for runs created in the same
                    # transaction (e.g. test fixtures). Break ties with the
                    # run id, which is monotonically increasing.
                    order_by=(TestRun.executed_at.desc(), TestRun.id.desc()),
                )
                .label("rn"),
            )
            .join(TestRun, TestRunResult.run_id == TestRun.id)
            .filter(TestRunResult.testcase_id.in_(test_case_ids))
        )
        if release_id is not None:
            result_query = result_query.filter(TestRun.release_id == release_id)
        ranked = result_query.subquery()
        latest_rows = (
            db.query(ranked.c.testcase_id, ranked.c.result, ranked.c.run_id, ranked.c.executed_at)
            .filter(ranked.c.rn == 1)
            .all()
        )
        latest_by_tc = {
            row.testcase_id: (row.result, row.run_id, row.executed_at) for row in latest_rows
        }

    tc_by_requirement: dict[int, list[TestCase]] = defaultdict(list)
    for tc in test_cases:
        tc_by_requirement[tc.requirement_id].append(tc)

    items = []
    for req in requirements:
        linked = tc_by_requirement.get(req.id, [])
        tc_items = []
        for tc in linked:
            result, run_id, executed_at = latest_by_tc.get(tc.id, (None, None, None))
            tc_items.append(
                TraceabilityTestCaseItem(
                    id=tc.id,
                    code=tc.code,
                    title=tc.title,
                    status=_status_for_result(result),
                    run_id=run_id,
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
                status=req.status,
                is_uncovered=(total == 0),
                coverage_percent=(covered_count / total) if total else 0.0,
                test_cases=tc_items,
            )
        )

    return TraceabilityResponse(items=items)
