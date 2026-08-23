import re
import uuid

from models.all_models import Project, Release, Requirement
from services.code_generator import next_code


def _create_requirement_row(db_session, **overrides):
    project = Project(name="Home Lending", description="d", key=f"TC{uuid.uuid4().hex[:6].upper()}")
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
    project = Project(name="Home Lending", description="d", key=f"REL{uuid.uuid4().hex[:6].upper()}")
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


def test_list_test_cases_rejects_unknown_project(client, auth_headers):
    response = client.get("/test-cases?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_list_test_cases_scoped_by_project(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    other_req = _create_requirement_row(db_session)
    _create_test_case(client, auth_headers, req.id, title="In scope")
    _create_test_case(client, auth_headers, other_req.id, title="Out of scope")

    response = client.get(f"/test-cases?project_id={req.project_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "In scope"


def test_list_test_cases_project_filter_excludes_unlinked(client, auth_headers, db_session):
    from models.all_models import TestCase

    req = _create_requirement_row(db_session)
    _create_test_case(client, auth_headers, req.id)

    orphan = TestCase(
        code=next_code(db_session, TestCase, "code", "TC"),
        title="Orphan test case",
        expected_result="n/a",
        priority="Low",
        status="Draft",
        requirement_id=None,
    )
    db_session.add(orphan)
    db_session.commit()

    response = client.get(f"/test-cases?project_id={req.project_id}", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert all(item["requirement_id"] is not None for item in data["items"])


def test_list_test_cases_search_matches_title_or_code(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    tc1 = _create_test_case(client, auth_headers, req.id, title="Login with OTP").json()
    _create_test_case(client, auth_headers, req.id, title="Password reset flow")

    response = client.get(f"/test-cases?requirement_id={req.id}&search=OTP", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == tc1["id"]

    code_response = client.get(
        f"/test-cases?requirement_id={req.id}&search={tc1['code']}", headers=auth_headers
    )
    code_data = code_response.json()
    assert code_data["total"] == 1
    assert code_data["items"][0]["id"] == tc1["id"]


def test_list_test_cases_includes_requirement_summary(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    _create_test_case(client, auth_headers, req.id)

    response = client.get(f"/test-cases?requirement_id={req.id}", headers=auth_headers)
    data = response.json()
    assert data["items"][0]["requirement"]["req_id"] == req.req_id


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


def test_list_test_cases_excludes_deprecated_by_default(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    active = _create_test_case(client, auth_headers, req.id, title="Active one").json()
    deprecated = _create_test_case(client, auth_headers, req.id, title="Deprecated one").json()
    client.delete(f"/test-cases/{deprecated['id']}", headers=auth_headers)

    response = client.get(f"/test-cases?requirement_id={req.id}", headers=auth_headers)
    data = response.json()
    ids = [item["id"] for item in data["items"]]
    assert active["id"] in ids
    assert deprecated["id"] not in ids
    assert data["total"] == 1


def test_list_test_cases_explicit_deprecated_filter_still_works(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    deprecated = _create_test_case(client, auth_headers, req.id, title="Deprecated one").json()
    client.delete(f"/test-cases/{deprecated['id']}", headers=auth_headers)

    response = client.get(
        f"/test-cases?requirement_id={req.id}&status=Deprecated", headers=auth_headers
    )
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == deprecated["id"]


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


def test_list_test_cases_denies_without_membership(client, member_auth_headers, project):
    response = client.get(f"/test-cases?project_id={project.id}", headers=member_auth_headers)
    assert response.status_code == 403


def test_list_test_cases_without_project_id_filters_to_permitted(client, db_session, member_user, project, role_by_key):
    from models.all_models import ProjectMember

    admin_headers = _superadmin_headers(db_session)

    other_req = _create_requirement_row(db_session)  # a different project than `project`
    _create_test_case(client, admin_headers, other_req.id, title="Not visible to member")

    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    req = _create_requirement_row(db_session, project_id=project.id)
    _create_test_case(client, admin_headers, req.id, title="Visible to member")

    from services.auth_service import create_access_token
    member_headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}
    response = client.get("/test-cases", headers=member_headers)
    assert response.status_code == 200
    titles = {item["title"] for item in response.json()["items"]}
    assert "Visible to member" in titles
    assert "Not visible to member" not in titles


def test_execute_and_results_require_test_runs_permission(client, db_session, member_user, project, role_by_key):
    from models.all_models import ProjectMember, Release, TestRun

    admin_headers = _superadmin_headers(db_session)
    req = _create_requirement_row(db_session, project_id=project.id)
    tc = _create_test_case(client, admin_headers, req.id).json()

    release = Release(project_id=project.id, version_name="v1.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    run = client.post("/test-runs", json={"release_id": release.id}, headers=admin_headers).json()

    viewer = role_by_key("viewer")  # Read only on test_runs
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    from services.auth_service import create_access_token
    member_headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post(
        f"/test-cases/{tc['id']}/execute",
        json={"run_id": run["id"], "result": "Pass"},
        headers=member_headers,
    )
    assert response.status_code == 403  # Viewer has Read, execute needs Edit

    read_response = client.get(f"/test-cases/{tc['id']}/results", headers=member_headers)
    assert read_response.status_code == 200  # Read is enough to view results


def _superadmin_headers(db_session):
    from models.all_models import User
    from services.auth_service import create_access_token

    admin = db_session.query(User).filter(User.is_superadmin == True).first()
    if admin is None:
        admin = User(email="auto-super@example.com", hashed_password="x", is_superadmin=True)
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


# --- Final whole-branch review fixes -------------------------------------


def _make_orphan(db_session):
    from models.all_models import TestCase

    orphan = TestCase(
        code=next_code(db_session, TestCase, "code", "TC"),
        title="Orphan test case",
        expected_result="n/a",
        priority="Low",
        status="Draft",
        requirement_id=None,
    )
    db_session.add(orphan)
    db_session.commit()
    db_session.refresh(orphan)
    return orphan


def test_orphan_test_case_read_denied_without_superadmin(client, db_session, member_auth_headers):
    """A test case with requirement_id=None has no project to derive permission
    from — that used to skip the check entirely (fail open)."""
    orphan = _make_orphan(db_session)
    assert client.get(f"/test-cases/{orphan.id}", headers=member_auth_headers).status_code == 403
    # ...but a superadmin can still reach it.
    assert client.get(
        f"/test-cases/{orphan.id}", headers=_superadmin_headers(db_session)
    ).status_code == 200


def test_orphan_test_case_delete_denied_without_superadmin(client, db_session, member_auth_headers):
    orphan = _make_orphan(db_session)
    response = client.delete(f"/test-cases/{orphan.id}", headers=member_auth_headers)
    assert response.status_code == 403
    db_session.refresh(orphan)
    assert orphan.status == "Draft"  # not soft-deleted


def test_orphan_test_case_results_denied_without_superadmin(client, db_session, member_auth_headers):
    orphan = _make_orphan(db_session)
    assert client.get(
        f"/test-cases/{orphan.id}/results", headers=member_auth_headers
    ).status_code == 403
    assert client.get(
        f"/test-cases/{orphan.id}/results", headers=_superadmin_headers(db_session)
    ).status_code == 200


def test_update_test_case_denies_cross_project_takeover(
    client, db_session, member_user, role_by_key
):
    """Edit on project B must not let a user rewrite a test case that currently
    lives in project A by re-pointing it at a project-B requirement."""
    from models.all_models import ProjectMember
    from services.auth_service import create_access_token

    admin_headers = _superadmin_headers(db_session)
    req_a = _create_requirement_row(db_session)               # project A
    req_b = _create_requirement_row(db_session)               # project B
    tc = _create_test_case(client, admin_headers, req_a.id, title="Belongs to project A").json()

    tester = role_by_key("tester")  # Edit on test_cases
    db_session.add(ProjectMember(project_id=req_b.project_id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}
    body = {
        "title": "Hijacked",
        "preconditions": None,
        "steps": "s",
        "expected_result": "e",
        "priority": "High",
        "status": "Active",
        "requirement_id": req_b.id,
    }
    response = client.put(f"/test-cases/{tc['id']}", json=body, headers=headers)
    assert response.status_code == 403

    from models.all_models import TestCase
    db_session.expire_all()
    unchanged = db_session.get(TestCase, tc["id"])
    assert unchanged.title == "Belongs to project A"
    assert unchanged.requirement_id == req_a.id


def test_update_test_case_allowed_when_member_of_both_projects(
    client, db_session, member_user, role_by_key
):
    from models.all_models import ProjectMember
    from services.auth_service import create_access_token

    admin_headers = _superadmin_headers(db_session)
    req_a = _create_requirement_row(db_session)
    req_b = _create_requirement_row(db_session)
    tc = _create_test_case(client, admin_headers, req_a.id).json()

    tester = role_by_key("tester")
    db_session.add(ProjectMember(project_id=req_a.project_id, user_id=member_user.id, role_id=tester.id))
    db_session.add(ProjectMember(project_id=req_b.project_id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}
    body = {
        "title": "Moved legitimately",
        "preconditions": None,
        "steps": "s",
        "expected_result": "e",
        "priority": "High",
        "status": "Active",
        "requirement_id": req_b.id,
    }
    response = client.put(f"/test-cases/{tc['id']}", json=body, headers=headers)
    assert response.status_code == 200
    assert response.json()["requirement_id"] == req_b.id
