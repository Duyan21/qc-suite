from models.all_models import Project, Release, ReleaseTestCase


def _create_project(db_session, key="RLA"):
    project = Project(name="Home Lending", description="d", key=key)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def test_create_release_defaults_status_new_and_owner_to_creator(client, auth_headers, db_session, test_user):
    project = _create_project(db_session)
    response = client.post(
        "/releases",
        json={"project_id": project.id, "version_name": "Hotfix — Auth Fix"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["version_name"] == "Hotfix — Auth Fix"
    assert data["status"] == "New"
    assert data["owner_user_id"] == test_user.id
    assert data["total_test_cases"] == 0
    assert data["pass_count"] == 0


def test_create_release_rejects_unknown_project(client, auth_headers):
    response = client.post("/releases", json={"project_id": 999999, "version_name": "x"}, headers=auth_headers)
    assert response.status_code == 400


def test_create_release_requires_edit(client, db_session, member_user, role_by_key):
    from conftest import make_project_member
    from services.auth_service import create_access_token

    project = _create_project(db_session, key="RLB")
    make_project_member(db_session, project, member_user, "viewer")
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post("/releases", json={"project_id": project.id, "version_name": "x"}, headers=headers)
    assert response.status_code == 403


def test_list_releases_includes_counts(client, auth_headers, db_session):
    project = _create_project(db_session, key="RLC")
    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    db_session.add_all([
        ReleaseTestCase(release_id=release.id, testcase_id=1, current_result="Pass"),
    ])
    # testcase_id=1 need not exist for this count-only assertion since the
    # list endpoint counts release_test_cases rows directly, not a join.
    db_session.commit()

    response = client.get(f"/releases?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["total_test_cases"] == 1
    assert data[0]["pass_count"] == 1


def test_get_release_not_found(client, auth_headers):
    response = client.get("/releases/999999", headers=auth_headers)
    assert response.status_code == 404


def test_update_release_status_requires_full(client, db_session, member_user, role_by_key):
    from conftest import make_project_member
    from services.auth_service import create_access_token

    project = _create_project(db_session, key="RLD")
    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    make_project_member(db_session, project, member_user, "tester")  # Edit, not Full, on test_runs
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.patch(f"/releases/{release.id}/status", json={"status": "Completed"}, headers=headers)
    assert response.status_code == 403


def test_update_release_status_as_full_succeeds(client, auth_headers, db_session):
    project = _create_project(db_session, key="RLE")
    release = Release(project_id=project.id, version_name="v1")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    response = client.patch(f"/releases/{release.id}/status", json={"status": "Completed"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Completed"
