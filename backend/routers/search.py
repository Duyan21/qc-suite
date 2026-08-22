from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.all_models import Requirement, TestCase, User
from models.base import get_db
from schemas.search import SearchRequest, SearchResponse, SearchResultItem
from services.auth_service import get_current_user
from services.embedding_service import embed
from services.permissions import PermissionArea, PermissionLevel, permitted_project_ids

router = APIRouter(tags=["search"], dependencies=[Depends(get_current_user)])


@router.post("/search", response_model=SearchResponse)
def semantic_search(
    payload: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query_vector = embed(payload.query, task_type="RETRIEVAL_QUERY")
    distance = TestCase.embedding.cosine_distance(query_vector)
    score_expr = 1 - distance

    query = db.query(TestCase, score_expr.label("score")).filter(TestCase.embedding.isnot(None))

    if payload.project_id is not None:
        query = query.join(Requirement, TestCase.requirement_id == Requirement.id).filter(
            Requirement.project_id == payload.project_id
        )
    else:
        allowed_ids = permitted_project_ids(db, current_user, PermissionArea.AI_TOOLS, PermissionLevel.READ)
        if allowed_ids is not None:
            query = query.join(Requirement, TestCase.requirement_id == Requirement.id).filter(
                Requirement.project_id.in_(allowed_ids)
            )

    rows = (
        query.filter(score_expr >= payload.threshold)
        .order_by(distance)
        .limit(payload.limit)
        .all()
    )
    items = [
        SearchResultItem(
            id=tc.id,
            code=tc.code,
            title=tc.title,
            requirement_id=tc.requirement_id,
            status=tc.status,
            score=round(float(score), 4),
        )
        for tc, score in rows
    ]
    return SearchResponse(items=items)
