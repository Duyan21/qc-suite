import os

import pytest

from models.all_models import Requirement
from tests.conftest import make_project_member

requires_real_gemini_key = pytest.mark.skipif(
    os.getenv("GEMINI_API_KEY") in (None, "", "your-gemini-api-key-here"),
    reason="requires a real GEMINI_API_KEY in backend/.env",
)


# NOTE: this dev DB is seeded with REQ-001..REQ-050 (see backend/seed.py), so the
# brief's original REQ-9040 id collides with the global UNIQUE(req_id, version)
# constraint. Using an out-of-range id here to keep this test isolated from seed data
# (same convention as test_agent_context_service.py / test_agent_prompt_service.py).
def _make_requirement(db_session, project, req_id="REQ-9040", version=1, description="Login requires OTP verification via SMS."):
    req = Requirement(
        project_id=project.id,
        req_id=req_id,
        version=version,
        title=f"{req_id} v{version}",
        description=description,
        status="Active",
        is_current=True,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def test_analyse_requires_auth(client):
    response = client.post("/agent/analyse", json={"req_id": "REQ-9040"})
    assert response.status_code == 401


def test_analyse_404_for_unknown_req_id(client, auth_headers):
    response = client.post("/agent/analyse", json={"req_id": "REQ-DOES-NOT-EXIST"}, headers=auth_headers)
    assert response.status_code == 404


def test_analyse_403_without_ai_tools_permission(client, db_session, project, member_user, member_auth_headers, role_by_key):
    _make_requirement(db_session, project)
    make_project_member(db_session, project, member_user, "viewer")

    response = client.post("/agent/analyse", json={"req_id": "REQ-9040"}, headers=member_auth_headers)

    assert response.status_code == 403


@requires_real_gemini_key
def test_analyse_returns_result_and_caches_it(client, db_session, project, auth_headers):
    _make_requirement(db_session, project)

    first = client.post("/agent/analyse", json={"req_id": "REQ-9040"}, headers=auth_headers)
    assert first.status_code == 200
    assert first.headers["X-Cache"] == "MISS"
    body = first.json()
    assert body["req_id"] == "REQ-9040"

    second = client.post("/agent/analyse", json={"req_id": "REQ-9040"}, headers=auth_headers)
    assert second.status_code == 200
    assert second.headers["X-Cache"] == "HIT"
    assert second.json() == body
