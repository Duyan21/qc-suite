import os

import pytest

from models.all_models import Requirement
from services.agent_context_service import gather_context
from services.agent_prompt_service import build_prompt, call_gemini_analyse

requires_real_gemini_key = pytest.mark.skipif(
    os.getenv("GEMINI_API_KEY") in (None, "", "your-gemini-api-key-here"),
    reason="requires a real GEMINI_API_KEY in backend/.env",
)


def test_build_prompt_includes_requirement_and_contract_keys(db_session, project):
    # NOTE: this dev DB is seeded with REQ-001..REQ-050 (see backend/seed.py), so the
    # brief's original REQ-030/REQ-031 ids collide with the global UNIQUE(req_id, version)
    # constraint — using REQ-9xxx ids instead, per the same fix already applied in
    # test_agent_context_service.py.
    req = Requirement(
        project_id=project.id,
        req_id="REQ-9030",
        version=1,
        title="OTP login",
        description="Login requires a 6-digit OTP sent by SMS.",
        status="Active",
        is_current=True,
    )
    db_session.add(req)
    db_session.commit()

    context = gather_context(db_session, "REQ-9030")
    prompt = build_prompt(context)

    assert "REQ-9030" in prompt
    assert "OTP login" in prompt
    assert "tc_updates" in prompt
    assert "tc_gaps" in prompt
    assert "questions" in prompt


@requires_real_gemini_key
def test_call_gemini_analyse_returns_contract_shaped_dict(db_session, project):
    req = Requirement(
        project_id=project.id,
        req_id="REQ-9031",
        version=1,
        title="Password reset",
        description="User can reset their password via a link emailed to their registered address. The link expires after 30 minutes.",
        status="Active",
        is_current=True,
    )
    db_session.add(req)
    db_session.commit()

    context = gather_context(db_session, "REQ-9031")
    prompt = build_prompt(context)
    result = call_gemini_analyse(prompt)

    assert result["req_id"] == "REQ-9031"
    assert set(result.keys()) == {"req_id", "version", "summary", "tc_updates", "tc_gaps", "questions"}
    assert isinstance(result["tc_updates"], list)
    assert isinstance(result["tc_gaps"], list)
    assert isinstance(result["questions"], list)
