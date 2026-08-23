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

    cache_key = make_cache_key(req_current.req_id, req_current.version)
    cached = get_cached_result(db, cache_key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return AgentAnalysisResponse(**cached)

    context = gather_context(db, payload.req_id)
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
    store_result(db, cache_key, result)

    response.headers["X-Cache"] = "MISS"
    return AgentAnalysisResponse(**result)
