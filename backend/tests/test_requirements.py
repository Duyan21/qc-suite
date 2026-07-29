def _create_requirement(client, auth_headers, **overrides):
    body = {
        "title": "User can log in",
        "description": "As a user, I want to log in with email and password",
        "status": "Draft",
    }
    body.update(overrides)
    return client.post("/requirements", json=body, headers=auth_headers)


def test_create_requirement_generates_req_id_and_version_1(client, auth_headers):
    response = _create_requirement(client, auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["req_id"] == "REQ-001"
    assert data["version"] == 1
    assert data["is_current"] is True


def test_list_requirements_returns_only_current_versions(client, auth_headers):
    _create_requirement(client, auth_headers)
    response = client.get("/requirements", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["is_current"] is True


def test_list_requirements_filters_by_status(client, auth_headers):
    _create_requirement(client, auth_headers, status="Draft")
    _create_requirement(client, auth_headers, status="Active")
    response = client.get("/requirements?status=Active", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Active"


def test_list_requirements_search_matches_title(client, auth_headers):
    _create_requirement(client, auth_headers, title="OTP login flow")
    _create_requirement(client, auth_headers, title="Password reset")
    response = client.get("/requirements?search=OTP", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert "OTP" in data["items"][0]["title"]


def test_get_requirement_detail_by_id(client, auth_headers):
    created = _create_requirement(client, auth_headers).json()
    response = client.get(f"/requirements/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_requirement_detail_missing_returns_404(client, auth_headers):
    response = client.get("/requirements/999999", headers=auth_headers)
    assert response.status_code == 404


def test_update_requirement_creates_new_version_and_history_has_three(client, auth_headers):
    v1 = _create_requirement(client, auth_headers).json()

    update_body = {
        "title": "User can log in (v2)",
        "description": "Adds OTP step",
        "status": "Active",
        "change_note": "Added OTP",
    }
    v2_response = client.put(f"/requirements/{v1['id']}", json=update_body, headers=auth_headers)
    assert v2_response.status_code == 200
    v2 = v2_response.json()
    assert v2["version"] == 2
    assert v2["is_current"] is True
    assert v2["previous_version_id"] == v1["id"]
    assert v2["req_id"] == v1["req_id"]

    update_body_2 = {**update_body, "title": "User can log in (v3)", "change_note": "Fix wording"}
    v3_response = client.put(f"/requirements/{v2['id']}", json=update_body_2, headers=auth_headers)
    v3 = v3_response.json()
    assert v3["version"] == 3

    history_response = client.get(f"/requirements/{v1['req_id']}/history", headers=auth_headers)
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 3
    assert [item["version"] for item in history] == [1, 2, 3]
    assert history[0]["is_current"] is False
    assert history[1]["is_current"] is False
    assert history[2]["is_current"] is True


def test_requirements_require_auth(client):
    response = client.get("/requirements")
    assert response.status_code == 401
