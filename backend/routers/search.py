from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.all_models import Project, Requirement, TestCase, TestRun, TestRunResult
from models.base import get_db
from schemas.common import RequirementSummary
from schemas.search import SearchRequest, SearchResponse, SearchResultItem
from services.auth_service import get_current_user
from services.embedding_service import embed

router = APIRouter(tags=["search"], dependencies=[Depends(get_current_user)])


@router.post("/search", response_model=SearchResponse)
def semantic_search(payload: SearchRequest, db: Session = Depends(get_db)):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="project_id not found")

    query_vector = embed(payload.query, task_type="RETRIEVAL_QUERY")
    distance = TestCase.embedding.cosine_distance(query_vector)
    score_expr = 1 - distance

    rows = (
        db.query(TestCase, score_expr.label("score"))
        .join(Requirement, TestCase.requirement_id == Requirement.id)
        .filter(Requirement.project_id == payload.project_id)
        .filter(TestCase.embedding.isnot(None))
        .filter(score_expr >= payload.threshold)
        .order_by(distance)
        .limit(payload.limit)
        .all()
    )

    testcase_ids = [tc.id for tc, _ in rows]

    requirement_ids = {tc.requirement_id for tc, _ in rows if tc.requirement_id is not None}
    requirements_by_id = {}
    if requirement_ids:
        for req in db.query(Requirement).filter(Requirement.id.in_(requirement_ids)).all():
            requirements_by_id[req.id] = req

    last_result_by_testcase: dict[int, str] = {}
    if testcase_ids:
        run_results = (
            db.query(TestRunResult.testcase_id, TestRunResult.result)
            .join(TestRun, TestRunResult.run_id == TestRun.id)
            .filter(TestRunResult.testcase_id.in_(testcase_ids))
            .order_by(TestRun.executed_at.desc(), TestRunResult.id.desc())
            .all()
        )
        for testcase_id, result in run_results:
            if testcase_id not in last_result_by_testcase:
                last_result_by_testcase[testcase_id] = result

    items = [
        SearchResultItem(
            id=tc.id,
            code=tc.code,
            title=tc.title,
            priority=tc.priority,
            status=tc.status,
            requirement_id=tc.requirement_id,
            requirement=RequirementSummary.model_validate(requirements_by_id[tc.requirement_id])
            if tc.requirement_id in requirements_by_id
            else None,
            last_result=last_result_by_testcase.get(tc.id),
            score=round(float(score), 4),
        )
        for tc, score in rows
    ]
    return SearchResponse(items=items)
