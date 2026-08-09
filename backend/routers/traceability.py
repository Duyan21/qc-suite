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
    return "partial"


@router.get("", response_model=TraceabilityResponse)
def get_traceability(project_id: int = Query(...), db: Session = Depends(get_db)):
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

    latest_result_by_tc: dict[int, str | None] = {}
    if test_case_ids:
        ranked = (
            db.query(
                TestRunResult.testcase_id.label("testcase_id"),
                TestRunResult.result.label("result"),
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
            .subquery()
        )
        latest_rows = (
            db.query(ranked.c.testcase_id, ranked.c.result).filter(ranked.c.rn == 1).all()
        )
        latest_result_by_tc = {row.testcase_id: row.result for row in latest_rows}

    tc_by_requirement: dict[int, list[TestCase]] = defaultdict(list)
    for tc in test_cases:
        tc_by_requirement[tc.requirement_id].append(tc)

    items = []
    for req in requirements:
        linked = tc_by_requirement.get(req.id, [])
        tc_items = [
            TraceabilityTestCaseItem(
                id=tc.id,
                code=tc.code,
                title=tc.title,
                status=_status_for_result(latest_result_by_tc.get(tc.id)),
            )
            for tc in linked
        ]
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
