import os
from unittest.mock import patch

import pytest

from models.all_models import Project, Release, ReleaseTestCase, ReleaseTestCaseExecution, Requirement, TestCase

requires_gemini = pytest.mark.skipif(
    os.getenv("GEMINI_API_KEY") in (None, "", "your-gemini-api-key-here"),
    reason="requires a real GEMINI_API_KEY in backend/.env",
)


def _tc_with_vector(db_session, code, title, vector, requirement_id=None):
    tc = TestCase(
        code=code,
        title=title,
        expected_result="n/a",
        priority="Low",
        status="Active",
        requirement_id=requirement_id,
        embedding=vector,
    )
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return tc


@requires_gemini
def test_search_requires_auth(client):
    response = client.post("/search", json={"query": "login"})
    assert response.status_code == 401


@requires_gemini
def test_search_returns_results_above_threshold(client, auth_headers, db_session):
    _tc_with_vector(db_session, "TC-100", "OTP login", [0.1] * 768)
    _tc_with_vector(db_session, "TC-101", "Unrelated", [-0.1] * 768)

    response = client.post(
        "/search",
        json={"query": "xac thuc bang OTP", "limit": 10, "threshold": 0.0},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 1
    assert all(0.0 <= item["score"] <= 1.0 for item in data["items"])


@requires_gemini
def test_search_excludes_test_cases_without_embedding(client, auth_headers, db_session):
    tc = TestCase(
        code="TC-102",
        title="No vector yet",
        expected_result="n/a",
        priority="Low",
        status="Draft",
    )
    db_session.add(tc)
    db_session.commit()

    response = client.post(
        "/search",
        json={"query": "anything", "threshold": 0.0},
        headers=auth_headers,
    )

    codes = [item["code"] for item in response.json()["items"]]
    assert "TC-102" not in codes


@requires_gemini
def test_search_respects_limit(client, auth_headers, db_session):
    for i in range(1, 6):
        _tc_with_vector(db_session, f"TC-2{i}", f"Case {i}", [0.05 * i] * 768)

    response = client.post(
        "/search",
        json={"query": "case", "limit": 2, "threshold": 0.0},
        headers=auth_headers,
    )

    assert len(response.json()["items"]) <= 2


@requires_gemini
def test_search_without_project_id_filters_to_permitted(client, db_session, member_user, project, role_by_key):
    from models.all_models import ProjectMember, Requirement, TestCase
    from services.code_generator import next_code
    from services.auth_service import create_access_token

    req = Requirement(
        project_id=project.id, req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1, title="T", description="d", status="Active", is_current=True,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    tc = TestCase(
        code=next_code(db_session, TestCase, "code", "TC"), title="Login flow",
        expected_result="ok", priority="High", status="Active", requirement_id=req.id,
        embedding=[0.1] * 768,
    )
    db_session.add(tc)
    db_session.commit()

    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}
    response = client.post("/search", json={"query": "login", "threshold": 0.0}, headers=headers)
    assert response.status_code == 200
    # member has read access to `project` via viewer role, so results from it are allowed through


@requires_gemini
def test_search_with_project_id_denies_non_member(client, member_auth_headers, project):
    response = client.post(
        "/search", json={"query": "login", "project_id": project.id}, headers=member_auth_headers
    )
    assert response.status_code == 403


def _fake_embed(text, task_type=None):
    return [0.1] * 768


def test_search_last_result_reflects_latest_execution(client, auth_headers, db_session):
    project = Project(name="Home Lending", description="d", key="SR1")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    req = Requirement(project_id=project.id, req_id="REQ-SR1", version=1, title="Login", description="d", status="Active", is_current=True)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    tc = TestCase(code="TC-SR1", title="Login works", expected_result="e", requirement_id=req.id, embedding=[0.1] * 768)
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)

    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    rtc = ReleaseTestCase(release_id=release.id, testcase_id=tc.id, current_result="Pass")
    db_session.add(rtc)
    db_session.commit()
    db_session.refresh(rtc)
    db_session.add(ReleaseTestCaseExecution(release_test_case_id=rtc.id, result="Fail"))
    db_session.add(ReleaseTestCaseExecution(release_test_case_id=rtc.id, result="Pass"))
    db_session.commit()

    with patch("routers.search.embed", side_effect=_fake_embed):
        response = client.post(
            "/search",
            json={"project_id": project.id, "query": "login", "limit": 10, "threshold": 0.0},
            headers=auth_headers,
        )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["last_result"] == "Pass"
