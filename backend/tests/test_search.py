import os

import pytest

from models.all_models import TestCase

pytestmark = pytest.mark.skipif(
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


def test_search_requires_auth(client):
    response = client.post("/search", json={"query": "login"})
    assert response.status_code == 401


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


def test_search_respects_limit(client, auth_headers, db_session):
    for i in range(1, 6):
        _tc_with_vector(db_session, f"TC-2{i}", f"Case {i}", [0.05 * i] * 768)

    response = client.post(
        "/search",
        json={"query": "case", "limit": 2, "threshold": 0.0},
        headers=auth_headers,
    )

    assert len(response.json()["items"]) <= 2
