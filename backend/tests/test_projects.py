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
            "modules": ["Auth", "Payments"],
            "status": "Active",
            "require_requirement_link": False,
            "auto_resolve_days": 7,
            "ai_impact_suggestions": True,
            "slack_alerts_enabled": True,
            "retention_days": 180,
            "default_severity": "High",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["modules"] == ["Auth", "Payments"]
    assert data["retention_days"] == 180


def test_update_project_settings_requires_edit_permission(client, db_session, project, member_user, role_by_key):
    viewer = role_by_key("viewer")
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    from services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.put(
        f"/projects/{project.id}",
        json={
            "name": project.name, "description": None, "key": project.key, "modules": [],
            "status": "Active", "require_requirement_link": True, "auto_resolve_days": None,
            "ai_impact_suggestions": True, "slack_alerts_enabled": False, "retention_days": 365,
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
