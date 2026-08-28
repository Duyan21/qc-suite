from sqlalchemy.orm import Session

from models.all_models import Defect, Requirement, TestCase
from services.embedding_service import embed


def gather_context(db: Session, req_id: str, proposed_description: str | None = None) -> dict:
    req_current = (
        db.query(Requirement)
        .filter(Requirement.req_id == req_id, Requirement.is_current == True)
        .first()
    )
    if req_current is None:
        raise ValueError(f"No current version found for req_id={req_id}")

    proposed_description = proposed_description.strip() if proposed_description else None

    req_previous = (
        db.get(Requirement, req_current.previous_version_id)
        if req_current.previous_version_id is not None and not proposed_description
        else None
    )

    tc_linked = (
        db.query(TestCase)
        .filter(TestCase.requirement_id == req_current.id)
        .all()
    )
    linked_ids = {tc.id for tc in tc_linked}

    tc_related: list[TestCase] = []
    search_text = proposed_description or req_current.description
    if search_text:
        query_vector = embed(search_text, task_type="RETRIEVAL_QUERY")
        distance = TestCase.embedding.cosine_distance(query_vector)
        related_query = (
            db.query(TestCase)
            .join(Requirement, TestCase.requirement_id == Requirement.id)
            .filter(TestCase.embedding.isnot(None), Requirement.project_id == req_current.project_id)
        )
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
        "proposed_description": proposed_description,
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
    if context.get("proposed_description"):
        parts.append(context["proposed_description"])
    for tc in [*context["tc_linked"], *context["tc_related"]]:
        parts.extend([tc.title, tc.preconditions or "", tc.steps or "", tc.expected_result])
    for defect in context["defect_history"]:
        parts.append(defect.title)
        parts.append(defect.description or "")
    total_chars = sum(len(p) for p in parts)
    return total_chars // 4
