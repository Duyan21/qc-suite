import re

from models.all_models import Project, Release, Requirement
from services.code_generator import next_code


def _create_requirement_row(db_session, **overrides):
    project = Project(name="Home Lending", description="d")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    defaults = dict(
        req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1,
        title="User can log in",
        description="d",
        status="Active",
        is_current=True,
        project_id=project.id,
    )
    defaults.update(overrides)
    req = Requirement(**defaults)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_release_row(db_session):
    project = Project(name="Home Lending", description="d")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    release = Release(project_id=project.id, version_name="v2.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    return release


def _create_test_case(client, auth_headers, requirement_id, **overrides):
    body = {
        "title": "Login with valid credentials",
        "preconditions": "User exists",
        "steps": "1. Open login page\n2. Enter credentials\n3. Submit",
        "expected_result": "User is redirected to dashboard",
        "priority": "High",
        "requirement_id": requirement_id,
    }
    body.update(overrides)
    return client.post("/test-cases", json=body, headers=auth_headers)


def test_create_test_case_generates_code(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    response = _create_test_case(client, auth_headers, req.id)
    assert response.status_code == 201
    data = response.json()
    assert re.fullmatch(r"TC-\d+", data["code"])
    assert data["status"] == "Draft"


def test_create_test_case_rejects_unknown_requirement(client, auth_headers):
    response = _create_test_case(client, auth_headers, 999999)
    assert response.status_code == 400


def test_list_test_cases_filters_by_requirement_priority(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    other_req = _create_requirement_row(db_session)
    _create_test_case(client, auth_headers, req.id, priority="High")
    _create_test_case(client, auth_headers, other_req.id, priority="Low")

    response = client.get(f"/test-cases?requirement_id={req.id}", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["requirement_id"] == req.id

    # Scoped by requirement_id too, so this isn't polluted by other
    # Low-priority test cases already committed in the shared dev DB.
    response = client.get(f"/test-cases?requirement_id={other_req.id}&priority=Low", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["priority"] == "Low"


def test_get_test_case_detail_includes_requirement_summary(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = _create_test_case(client, auth_headers, req.id).json()

    response = client.get(f"/test-cases/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["requirement"]["req_id"] == req.req_id


def test_update_test_case_changes_fields(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = _create_test_case(client, auth_headers, req.id).json()

    update_body = {
        "title": "Login with valid credentials (updated)",
        "preconditions": "User exists",
        "steps": "1. Open login page\n2. Enter credentials\n3. Submit",
        "expected_result": "User is redirected to dashboard",
        "priority": "Medium",
        "status": "Active",
        "requirement_id": req.id,
    }
    response = client.put(f"/test-cases/{created['id']}", json=update_body, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["priority"] == "Medium"
    assert data["status"] == "Active"


def test_delete_test_case_soft_deletes(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = _create_test_case(client, auth_headers, req.id).json()

    response = client.delete(f"/test-cases/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Deprecated"

    still_there = client.get(f"/test-cases/{created['id']}", headers=auth_headers)
    assert still_there.status_code == 200


def test_execute_test_case_creates_then_updates_result(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    release = _create_release_row(db_session)
    tc = _create_test_case(client, auth_headers, req.id).json()
    run = client.post(
        "/test-runs", json={"release_id": release.id, "executed_by": "An"}, headers=auth_headers
    ).json()

    first = client.post(
        f"/test-cases/{tc['id']}/execute",
        json={"run_id": run["id"], "result": "Fail", "note": "first try"},
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert first.json()["result"] == "Fail"

    second = client.post(
        f"/test-cases/{tc['id']}/execute",
        json={"run_id": run["id"], "result": "Pass", "note": "fixed"},
        headers=auth_headers,
    )
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["result"] == "Pass"
    assert second_data["id"] == first.json()["id"]

    history = client.get(f"/test-cases/{tc['id']}/results", headers=auth_headers)
    assert history.status_code == 200
    history_data = history.json()
    assert len(history_data) == 1
    assert history_data[0]["result"] == "Pass"
    assert history_data[0]["release_version"] == "v2.0.0"


def test_test_cases_require_auth(client):
    response = client.get("/test-cases")
    assert response.status_code == 401
