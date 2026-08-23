import os

import pytest

from models.all_models import Defect, Requirement, TestCase
from services.agent_context_service import estimate_token_count, gather_context

requires_real_gemini_key = pytest.mark.skipif(
    os.getenv("GEMINI_API_KEY") in (None, "", "your-gemini-api-key-here"),
    reason="requires a real GEMINI_API_KEY in backend/.env",
)


def _make_requirement(db_session, project, req_id, version, is_current, previous_version_id=None, description="Login must lock after 5 failed attempts."):
    req = Requirement(
        project_id=project.id,
        req_id=req_id,
        version=version,
        title=f"{req_id} v{version}",
        description=description,
        status="Active",
        is_current=is_current,
        previous_version_id=previous_version_id,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


@requires_real_gemini_key
def test_gather_context_returns_all_five_keys(db_session, project):
    # NOTE: this dev DB is seeded with REQ-001..REQ-050 (see backend/seed.py), so the
    # brief's original REQ-015/REQ-020 ids collide with the global UNIQUE(req_id, version)
    # constraint. Using out-of-range ids here to keep this test isolated from seed data.
    req_v1 = _make_requirement(db_session, project, "REQ-9015", 1, is_current=False)
    req_v2 = _make_requirement(db_session, project, "REQ-9015", 2, is_current=True, previous_version_id=req_v1.id)

    tc = TestCase(code="TC-500", title="Lockout after 5 attempts", expected_result="Account locked", priority="High", status="Active", requirement_id=req_v2.id)
    db_session.add(tc)
    defect = Defect(project_id=project.id, code="DEF-1", title="Lockout not enforced", severity="High", status="Open", requirement_id=req_v2.id)
    db_session.add(defect)
    db_session.commit()

    context = gather_context(db_session, "REQ-9015")

    assert set(context.keys()) == {"req_current", "req_previous", "tc_linked", "tc_related", "defect_history"}
    assert context["req_current"].id == req_v2.id
    assert context["req_previous"].id == req_v1.id
    assert [t.id for t in context["tc_linked"]] == [tc.id]
    assert [d.id for d in context["defect_history"]] == [defect.id]


@requires_real_gemini_key
def test_gather_context_handles_first_version_with_no_previous(db_session, project):
    _make_requirement(db_session, project, "REQ-9020", 1, is_current=True)

    context = gather_context(db_session, "REQ-9020")

    assert context["req_previous"] is None
    assert context["tc_linked"] == []
    assert context["defect_history"] == []


def test_gather_context_raises_for_unknown_req_id(db_session):
    with pytest.raises(ValueError):
        gather_context(db_session, "REQ-DOES-NOT-EXIST")


def test_estimate_token_count_is_roughly_chars_over_four():
    context = {
        "req_current": None,
        "req_previous": None,
        "tc_linked": [],
        "tc_related": [],
        "defect_history": [],
    }
    assert estimate_token_count(context) == 0
