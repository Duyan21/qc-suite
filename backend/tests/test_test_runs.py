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
