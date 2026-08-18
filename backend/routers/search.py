from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.all_models import TestCase
from models.base import get_db
from schemas.search import SearchRequest, SearchResponse, SearchResultItem
from services.auth_service import get_current_user
from services.embedding_service import embed

router = APIRouter(tags=["search"], dependencies=[Depends(get_current_user)])


@router.post("/search", response_model=SearchResponse)
def semantic_search(payload: SearchRequest, db: Session = Depends(get_db)):
    query_vector = embed(payload.query, task_type="RETRIEVAL_QUERY")
    distance = TestCase.embedding.cosine_distance(query_vector)
    score_expr = 1 - distance

    rows = (
        db.query(TestCase, score_expr.label("score"))
        .filter(TestCase.embedding.isnot(None))
        .filter(score_expr >= payload.threshold)
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
