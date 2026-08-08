import re


def _create_requirement(client, auth_headers, project_id, **overrides):
    body = {
        "title": "User can log in",
        "description": "As a user, I want to log in with email and password",
        "status": "Draft",
        "project_id": project_id,
    }
    body.update(overrides)
    return client.post("/requirements", json=body, headers=auth_headers)


def test_create_requirement_rejects_unknown_project(client, auth_headers):
    response = _create_requirement(client, auth_headers, project_id=999999)
    assert response.status_code == 400


def test_create_requirement_generates_req_id_and_version_1(client, auth_headers, project):
    response = _create_requirement(client, auth_headers, project.id)
    assert response.status_code == 201
    data = response.json()
    assert re.fullmatch(r"REQ-\d+", data["req_id"])
    assert data["version"] == 1
    assert data["is_current"] is True
    assert data["project_id"] == project.id


def test_list_requirements_requires_project_id(client, auth_headers):
    response = client.get("/requirements", headers=auth_headers)
    assert response.status_code == 422


def test_list_requirements_rejects_unknown_project(client, auth_headers):
    response = client.get("/requirements?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_list_requirements_returns_only_current_versions(client, auth_headers, project):
    _create_requirement(client, auth_headers, project.id)
    response = client.get(f"/requirements?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["is_current"] is True


def test_list_requirements_scoped_by_project(client, auth_headers, project, db_session):
    from models.all_models import Project

    other_project = Project(name="Other Project", description="d")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)

    _create_requirement(client, auth_headers, project.id, title="In scope")
    _create_requirement(client, auth_headers, other_project.id, title="Out of scope")

    response = client.get(f"/requirements?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "In scope"


def test_list_requirements_filters_by_status(client, auth_headers, project):
    _create_requirement(client, auth_headers, project.id, status="Draft")
    _create_requirement(client, auth_headers, project.id, status="Active")
    response = client.get(f"/requirements?project_id={project.id}&status=Active", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Active"


def test_list_requirements_search_matches_title(client, auth_headers, project):
    _create_requirement(client, auth_headers, project.id, title="OTP login flow")
    _create_requirement(client, auth_headers, project.id, title="Password reset")
    response = client.get(f"/requirements?project_id={project.id}&search=OTP", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert "OTP" in data["items"][0]["title"]


def test_get_requirement_detail_by_id(client, auth_headers, project):
    created = _create_requirement(client, auth_headers, project.id).json()
    response = client.get(f"/requirements/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_requirement_detail_missing_returns_404(client, auth_headers):
    response = client.get("/requirements/999999", headers=auth_headers)
    assert response.status_code == 404


def test_update_requirement_creates_new_version_and_history_has_three(client, auth_headers, project):
    v1 = _create_requirement(client, auth_headers, project.id).json()

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


def test_requirements_require_auth(client, project):
    response = client.get(f"/requirements?project_id={project.id}")
    assert response.status_code == 401


def test_list_requirements_paginates_across_pages(client, auth_headers, project):
    r1 = _create_requirement(client, auth_headers, project.id, title="Req One").json()
    r2 = _create_requirement(client, auth_headers, project.id, title="Req Two").json()
    r3 = _create_requirement(client, auth_headers, project.id, title="Req Three").json()

    page1 = client.get(f"/requirements?project_id={project.id}&page=1&limit=2", headers=auth_headers).json()
    assert page1["total"] == 3
    assert len(page1["items"]) == 2
    page1_ids = [item["id"] for item in page1["items"]]
    assert page1_ids == [r1["id"], r2["id"]]

    page2 = client.get(f"/requirements?project_id={project.id}&page=2&limit=2", headers=auth_headers).json()
    assert page2["total"] == 3
    assert len(page2["items"]) == 1
    page2_ids = [item["id"] for item in page2["items"]]
    assert page2_ids == [r3["id"]]
    assert not set(page2_ids) & set(page1_ids)
