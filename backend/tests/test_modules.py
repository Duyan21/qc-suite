from models.all_models import Defect, Module, ProjectMember, Requirement, TestCase
from services.code_generator import next_code


def _create_requirement(db_session, project, module, status="Active"):
    req = Requirement(
        project_id=project.id,
        req_id=next_code(db_session, Requirement, "req_id", "REQ"),
        version=1,
        title="T",
        description="d",
        module_id=module.id,
        status=status,
        is_current=True,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_test_case(db_session, requirement, status="Active"):
    tc = TestCase(
        code=next_code(db_session, TestCase, "code", "TC"),
        title="TC",
        expected_result="ok",
        priority="Medium",
        status=status,
        requirement_id=requirement.id,
    )
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return tc


def _create_defect(db_session, project, status="Open", requirement=None, test_case=None):
    defect = Defect(
        code=next_code(db_session, Defect, "code", "DEF"),
        title="D",
        severity="Medium",
        status=status,
        requirement_id=requirement.id if requirement else None,
        testcase_id=test_case.id if test_case else None,
        project_id=project.id,
    )
    db_session.add(defect)
    db_session.commit()
    db_session.refresh(defect)
    return defect


def test_list_modules_requires_auth(client, project):
    response = client.get(f"/projects/{project.id}/modules")
    assert response.status_code == 401


def test_list_modules_denies_non_member(client, member_auth_headers, project):
    response = client.get(f"/projects/{project.id}/modules", headers=member_auth_headers)
    assert response.status_code == 403


def test_create_and_list_modules(client, auth_headers, project):
    response = client.post(f"/projects/{project.id}/modules", json={"name": "Payments"}, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Payments"
    assert data["project_id"] == project.id

    listing = client.get(f"/projects/{project.id}/modules", headers=auth_headers)
    assert listing.status_code == 200
    names = {m["name"] for m in listing.json()}
    assert "Payments" in names


def test_create_module_rejects_empty_name(client, auth_headers, project):
    response = client.post(f"/projects/{project.id}/modules", json={"name": "   "}, headers=auth_headers)
    assert response.status_code == 400


def test_create_module_rejects_case_insensitive_duplicate(client, auth_headers, project):
    client.post(f"/projects/{project.id}/modules", json={"name": "Payments"}, headers=auth_headers)
    response = client.post(f"/projects/{project.id}/modules", json={"name": "payments"}, headers=auth_headers)
    assert response.status_code == 400


def test_create_module_requires_edit_permission(client, db_session, member_user, project, role_by_key):
    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    from services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post(f"/projects/{project.id}/modules", json={"name": "Payments"}, headers=headers)
    assert response.status_code == 403


def test_rename_module(client, auth_headers, project):
    created = client.post(f"/projects/{project.id}/modules", json={"name": "Old Name"}, headers=auth_headers).json()
    response = client.patch(
        f"/projects/{project.id}/modules/{created['id']}", json={"name": "New Name"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_rename_module_rejects_empty_name(client, auth_headers, project):
    created = client.post(f"/projects/{project.id}/modules", json={"name": "Old Name"}, headers=auth_headers).json()
    response = client.patch(
        f"/projects/{project.id}/modules/{created['id']}", json={"name": ""}, headers=auth_headers
    )
    assert response.status_code == 400


def test_rename_module_rejects_duplicate(client, auth_headers, project):
    client.post(f"/projects/{project.id}/modules", json={"name": "Alpha"}, headers=auth_headers)
    beta = client.post(f"/projects/{project.id}/modules", json={"name": "Beta"}, headers=auth_headers).json()
    response = client.patch(
        f"/projects/{project.id}/modules/{beta['id']}", json={"name": "alpha"}, headers=auth_headers
    )
    assert response.status_code == 400


def test_delete_unconnected_module_succeeds(client, auth_headers, project):
    created = client.post(f"/projects/{project.id}/modules", json={"name": "Unused"}, headers=auth_headers).json()
    response = client.delete(f"/projects/{project.id}/modules/{created['id']}", headers=auth_headers)
    assert response.status_code == 204

    listing = client.get(f"/projects/{project.id}/modules", headers=auth_headers).json()
    assert not any(m["id"] == created["id"] for m in listing)


def test_delete_blocked_by_active_requirement(client, auth_headers, project, db_session):
    module = Module(project_id=project.id, name="Blocked")
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    _create_requirement(db_session, project, module, status="Active")

    response = client.delete(f"/projects/{project.id}/modules/{module.id}", headers=auth_headers)
    assert response.status_code == 400
    assert "active item" in response.json()["detail"]


def test_delete_not_blocked_once_requirement_deprecated(client, auth_headers, project, db_session):
    module = Module(project_id=project.id, name="Freed")
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    _create_requirement(db_session, project, module, status="Deprecated")

    response = client.delete(f"/projects/{project.id}/modules/{module.id}", headers=auth_headers)
    assert response.status_code == 204


def test_delete_blocked_by_active_test_case_via_requirement(client, auth_headers, project, db_session):
    module = Module(project_id=project.id, name="TCBlocked")
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    req = _create_requirement(db_session, project, module, status="Deprecated")
    _create_test_case(db_session, req, status="Active")

    response = client.delete(f"/projects/{project.id}/modules/{module.id}", headers=auth_headers)
    assert response.status_code == 400


def test_delete_blocked_by_active_defect_via_requirement(client, auth_headers, project, db_session):
    module = Module(project_id=project.id, name="DefBlockedByReq")
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    req = _create_requirement(db_session, project, module, status="Deprecated")
    _create_defect(db_session, project, status="Open", requirement=req)

    response = client.delete(f"/projects/{project.id}/modules/{module.id}", headers=auth_headers)
    assert response.status_code == 400


def test_delete_blocked_by_active_defect_via_testcase_only(client, auth_headers, project, db_session):
    module = Module(project_id=project.id, name="DefBlockedByTC")
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    req = _create_requirement(db_session, project, module, status="Deprecated")
    tc = _create_test_case(db_session, req, status="Deprecated")
    _create_defect(db_session, project, status="Fixed", test_case=tc)

    response = client.delete(f"/projects/{project.id}/modules/{module.id}", headers=auth_headers)
    assert response.status_code == 400


def test_delete_not_blocked_once_everything_closed(client, auth_headers, project, db_session):
    module = Module(project_id=project.id, name="AllClosed")
    db_session.add(module)
    db_session.commit()
    db_session.refresh(module)
    req = _create_requirement(db_session, project, module, status="Deprecated")
    tc = _create_test_case(db_session, req, status="Deprecated")
    _create_defect(db_session, project, status="Closed", requirement=req, test_case=tc)

    response = client.delete(f"/projects/{project.id}/modules/{module.id}", headers=auth_headers)
    assert response.status_code == 204
