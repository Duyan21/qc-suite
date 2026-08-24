import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from models.all_models import Requirement, User
from models.base import get_db
from schemas.agent import AgentAnalyseRequest, AgentAnalysisResponse
from services.agent_cache_service import get_cached_result, make_cache_key, store_result
from services.agent_context_service import estimate_token_count, gather_context
from services.agent_prompt_service import build_prompt, call_gemini_analyse
from services.auth_service import get_current_user
from services.permissions import PermissionArea, PermissionLevel, check_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(get_current_user)])


@router.post("/analyse", response_model=AgentAnalysisResponse)
def analyse_requirement_impact(
    payload: AgentAnalyseRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req_current = (
        db.query(Requirement)
        .filter(Requirement.req_id == payload.req_id, Requirement.is_current == True)
        .first()
    )
    if req_current is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    check_permission(db, current_user, req_current.project_id, PermissionArea.AI_TOOLS, PermissionLevel.READ)

    proposed_description = (payload.proposed_description or "").strip() or None
    cache_key = None
    if proposed_description is None:
        cache_key = make_cache_key(req_current.req_id, req_current.version)
        cached = get_cached_result(db, cache_key)
        if cached is not None:
            response.headers["X-Cache"] = "HIT"
            return AgentAnalysisResponse(**cached)

    context = gather_context(db, payload.req_id, proposed_description=proposed_description)
    logger.info("agent analyse token estimate for %s: %s", payload.req_id, estimate_token_count(context))
    prompt = build_prompt(context)
    try:
        result = call_gemini_analyse(prompt)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Agent analysis failed: {exc}")

    result["req_id"] = req_current.req_id
    result["version"] = req_current.version
    result["summary"] = {
        "linked_tc_count": len(context["tc_linked"]),
        "related_tc_count": len(context["tc_related"]),
        "defect_count": len(context["defect_history"]),
    }

    # Gemini is only ever shown each TC's code, not its DB id (see _tc_summary), so it
    # can only guess at testcase_id — pin it back to the real id by code so "Open TC"
    # navigates correctly instead of 404ing on a hallucinated id.
    code_to_id = {tc.code: tc.id for tc in [*context["tc_linked"], *context["tc_related"]]}
    for update in result.get("tc_updates", []):
        real_id = code_to_id.get(update.get("code"))
        if real_id is not None:
            update["testcase_id"] = real_id

    response.headers["X-Cache"] = "MISS"
    if cache_key is not None:
        store_result(db, cache_key, result)
    return AgentAnalysisResponse(**result)
