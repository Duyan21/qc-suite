def test_create_project(client, auth_headers):
    response = client.post(
        "/projects",
        json={"name": "Home Lending", "description": "Fintech mortgage platform"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Home Lending"
    assert data["description"] == "Fintech mortgage platform"
    assert "id" in data


def test_list_projects(client, auth_headers):
    # Baseline count, not an assumed-empty table — the shared dev DB may
    # already have other projects committed (e.g. seed data).
    baseline_count = len(client.get("/projects", headers=auth_headers).json())

    client.post("/projects", json={"name": "Home Lending"}, headers=auth_headers)
    client.post("/projects", json={"name": "Auto Loans"}, headers=auth_headers)

    response = client.get("/projects", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == baseline_count + 2
    names = {item["name"] for item in data}
    assert {"Home Lending", "Auto Loans"} <= names


def test_projects_require_auth(client):
    response = client.get("/projects")
    assert response.status_code == 401


from models.all_models import ProjectMember, Role, User


def test_create_project_requires_permission(client, member_auth_headers):
    response = client.post("/projects", json={"name": "Blocked"}, headers=member_auth_headers)
    assert response.status_code == 403


def test_create_project_allowed_with_can_create_projects(client, db_session, member_user):
    member_user.can_create_projects = True
    db_session.commit()

    from services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post("/projects", json={"name": "Allowed Project"}, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["key"]  # auto-generated

    membership = (
        db_session.query(ProjectMember)
        .filter(ProjectMember.project_id == data["id"], ProjectMember.user_id == member_user.id)
        .one()
    )
    role = db_session.get(Role, membership.role_id)
    assert role.key == "admin"


def test_get_project_detail(client, auth_headers, project):
    response = client.get(f"/projects/{project.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == project.id


def test_update_project_settings(client, auth_headers, project):
    response = client.put(
        f"/projects/{project.id}",
        json={
            "name": project.name,
            "description": "Updated",
            "key": project.key,
            "status": "Active",
            "require_requirement_link": False,
            "auto_resolve_days": 7,
            "ai_impact_suggestions": True,
            "default_severity": "High",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["default_severity"] == "High"


def test_update_project_settings_requires_edit_permission(client, db_session, project, member_user, role_by_key):
    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    from services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.put(
        f"/projects/{project.id}",
        json={
            "name": project.name, "description": None, "key": project.key,
            "status": "Active", "require_requirement_link": True, "auto_resolve_days": None,
            "ai_impact_suggestions": True,
            "default_severity": "Medium",
        },
        headers=headers,
    )
    assert response.status_code == 403


def test_list_and_invite_members(client, auth_headers, project):
    response = client.post(
        f"/projects/{project.id}/members",
        json={"email": "new.member@example.com", "full_name": "New Member", "role_key": "tester"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new.member@example.com"
    assert data["status"] == "Invited"
    assert data["role_key"] == "tester"

    listing = client.get(f"/projects/{project.id}/members", headers=auth_headers)
    assert listing.status_code == 200
    emails = {m["email"] for m in listing.json()}
    assert "new.member@example.com" in emails


def test_update_member_role_and_status(client, auth_headers, project, member_user, role_by_key, db_session):
    tester = role_by_key("tester")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    response = client.patch(
        f"/projects/{project.id}/members/{member_user.id}",
        json={"role_key": "qa_lead", "status": "Suspended"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role_key"] == "qa_lead"
    assert data["status"] == "Suspended"


def test_remove_member(client, auth_headers, project, member_user, role_by_key, db_session):
    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    response = client.delete(f"/projects/{project.id}/members/{member_user.id}", headers=auth_headers)
    assert response.status_code == 204

    listing = client.get(f"/projects/{project.id}/members", headers=auth_headers).json()
    assert not any(m["user_id"] == member_user.id for m in listing)


def test_invite_member_rejects_already_existing_member(client, auth_headers, project, member_user, role_by_key, db_session):
    tester = role_by_key("tester")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    response = client.post(
        f"/projects/{project.id}/members",
        json={"email": member_user.email, "role_key": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_member_actions_require_edit_on_members_roles(client, db_session, project, member_user, role_by_key):
    tester = role_by_key("tester")  # tester has None on members_roles per the seeded matrix
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    from services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post(
        f"/projects/{project.id}/members",
        json={"email": "blocked@example.com", "role_key": "viewer"},
        headers=headers,
    )
    assert response.status_code == 403


# --- Final whole-branch review fixes -------------------------------------

from models.all_models import Project


def test_list_projects_scoped_to_membership(client, db_session, project, member_user, role_by_key):
    """A non-superadmin must only see projects they are a member of."""
    from services.auth_service import create_access_token

    other = Project(name="Stranger Project", description="d", key="STRG1")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    # Zero memberships -> empty list, not "every project in the system".
    assert client.get("/projects", headers=headers).json() == []

    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    ids = {p["id"] for p in client.get("/projects", headers=headers).json()}
    assert ids == {project.id}
    assert other.id not in ids


def test_get_project_denies_non_member(client, db_session, project, member_user, role_by_key):
    from services.auth_service import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}
    assert client.get(f"/projects/{project.id}", headers=headers).status_code == 403

    # A viewer (which has "none" on project_settings) must still see it.
    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()
    assert client.get(f"/projects/{project.id}", headers=headers).status_code == 200


def test_list_members_denies_non_member(client, db_session, project, member_user, role_by_key):
    from services.auth_service import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}
    assert client.get(f"/projects/{project.id}/members", headers=headers).status_code == 403

    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()
    assert client.get(f"/projects/{project.id}/members", headers=headers).status_code == 200


def test_update_project_rejects_duplicate_key(client, auth_headers, project, db_session):
    other = Project(name="Auto Loans", description="d", key="DUPKEY")
    db_session.add(other)
    db_session.commit()

    body = {
        "name": project.name, "description": None, "key": "DUPKEY",
        "status": "Active", "require_requirement_link": True, "auto_resolve_days": None,
        "ai_impact_suggestions": True,
        "default_severity": "Medium",
    }
    response = client.put(f"/projects/{project.id}", json=body, headers=auth_headers)
    assert response.status_code == 400
    assert "already in use" in response.json()["detail"]

    # Re-saving a project with its OWN unchanged key is still fine.
    body["key"] = project.key
    assert client.put(f"/projects/{project.id}", json=body, headers=auth_headers).status_code == 200


def test_cannot_demote_last_admin(client, auth_headers, project, member_user, role_by_key, db_session):
    admin = role_by_key("admin")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=admin.id))
    db_session.commit()

    response = client.patch(
        f"/projects/{project.id}/members/{member_user.id}",
        json={"role_key": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot remove the last admin of a project"


def test_cannot_remove_last_admin(client, auth_headers, project, member_user, role_by_key, db_session):
    admin = role_by_key("admin")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=admin.id))
    db_session.commit()

    response = client.delete(f"/projects/{project.id}/members/{member_user.id}", headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot remove the last admin of a project"


def test_last_admin_guard_lifts_once_a_second_admin_exists(
    client, auth_headers, project, member_user, test_user, role_by_key, db_session
):
    admin = role_by_key("admin")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=admin.id))
    db_session.add(ProjectMember(project_id=project.id, user_id=test_user.id, role_id=admin.id))
    db_session.commit()

    response = client.patch(
        f"/projects/{project.id}/members/{member_user.id}",
        json={"role_key": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["role_key"] == "viewer"


def test_non_admin_member_can_still_be_removed(client, auth_headers, project, member_user, role_by_key, db_session):
    tester = role_by_key("tester")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=tester.id))
    db_session.commit()

    assert client.delete(
        f"/projects/{project.id}/members/{member_user.id}", headers=auth_headers
    ).status_code == 204
