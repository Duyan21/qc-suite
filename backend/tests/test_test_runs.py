import uuid

from models.all_models import Project, Release


def _create_release(db_session):
    project = Project(name="Home Lending", description="d", key=f"TRN{uuid.uuid4().hex[:6].upper()}")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    release = Release(project_id=project.id, version_name="v2.0.0", note="first release")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    return release


def test_create_test_run(client, auth_headers, db_session):
    release = _create_release(db_session)
    response = client.post(
        "/test-runs",
        json={"release_id": release.id, "executed_by": "An", "note": "smoke run"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["release_id"] == release.id
    assert data["release_version"] == "v2.0.0"


def test_create_test_run_rejects_unknown_release(client, auth_headers):
    response = client.post(
        "/test-runs",
        json={"release_id": 999999, "executed_by": "An"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_test_runs_by_release(client, auth_headers, db_session):
    release = _create_release(db_session)
    client.post("/test-runs", json={"release_id": release.id, "executed_by": "An"}, headers=auth_headers)
    client.post("/test-runs", json={"release_id": release.id, "executed_by": "Huyen"}, headers=auth_headers)

    response = client.get(f"/test-runs?release_id={release.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(run["release_version"] == "v2.0.0" for run in data)


def test_test_runs_require_auth(client, db_session):
    release = _create_release(db_session)
    response = client.get(f"/test-runs?release_id={release.id}")
    assert response.status_code == 401


def test_create_test_run_requires_edit(client, db_session, member_user, role_by_key):
    from models.all_models import Project, ProjectMember, Release

    project = Project(name="Home Lending", description="d", key="TR1")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    release = Release(project_id=project.id, version_name="v1.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    viewer = role_by_key("viewer")  # Read only
    db_session.add(ProjectMember(project_id=project.id, user_id=member_user.id, role_id=viewer.id))
    db_session.commit()

    from services.auth_service import create_access_token
    headers = {"Authorization": f"Bearer {create_access_token(member_user.id)}"}

    response = client.post("/test-runs", json={"release_id": release.id}, headers=headers)
    assert response.status_code == 403


def test_list_test_runs_requires_read(client, member_auth_headers, db_session):
    from models.all_models import Project, Release

    project = Project(name="Home Lending", description="d", key="TR2")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    release = Release(project_id=project.id, version_name="v1.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)

    response = client.get(f"/test-runs?release_id={release.id}", headers=member_auth_headers)
    assert response.status_code == 403
