from sqlalchemy.orm import Session

from models.all_models import Defect, Requirement, TestCase
from services.embedding_service import embed


def gather_context(db: Session, req_id: str) -> dict:
    req_current = (
        db.query(Requirement)
        .filter(Requirement.req_id == req_id, Requirement.is_current == True)
        .first()
    )
    if req_current is None:
        raise ValueError(f"No current version found for req_id={req_id}")

    req_previous = (
        db.get(Requirement, req_current.previous_version_id)
        if req_current.previous_version_id is not None
        else None
    )

    tc_linked = (
        db.query(TestCase)
        .filter(TestCase.requirement_id == req_current.id)
        .all()
    )
    linked_ids = {tc.id for tc in tc_linked}

    tc_related: list[TestCase] = []
    if req_current.description:
        query_vector = embed(req_current.description, task_type="RETRIEVAL_QUERY")
        distance = TestCase.embedding.cosine_distance(query_vector)
        related_query = db.query(TestCase).filter(TestCase.embedding.isnot(None))
        if linked_ids:
            related_query = related_query.filter(~TestCase.id.in_(linked_ids))
        tc_related = related_query.order_by(distance).limit(10).all()

    defect_history = (
        db.query(Defect)
        .filter(Defect.requirement_id == req_current.id)
        .all()
    )

    return {
        "req_current": req_current,
        "req_previous": req_previous,
        "tc_linked": tc_linked,
        "tc_related": tc_related,
        "defect_history": defect_history,
    }


def estimate_token_count(context: dict) -> int:
    """Rough heuristic (chars / 4) — good enough to sanity-check we're nowhere near
    Gemini 3.5 Flash's 1M-token window (see CLAUDE.md's ~76K/7.6% figure), not a precise
    tokenizer count."""
    parts: list[str] = []
    for key in ("req_current", "req_previous"):
        req = context.get(key)
        if req is not None:
            parts.append(req.title)
            parts.append(req.description)
    for tc in [*context["tc_linked"], *context["tc_related"]]:
        parts.extend([tc.title, tc.preconditions or "", tc.steps or "", tc.expected_result])
    for defect in context["defect_history"]:
        parts.append(defect.title)
        parts.append(defect.description or "")
    total_chars = sum(len(p) for p in parts)
    return total_chars // 4
