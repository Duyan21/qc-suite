def test_create_release(client, auth_headers, project):
    response = client.post(
        "/releases",
        json={"project_id": project.id, "version_name": "v2.0.0", "note": "Q3 release"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["project_id"] == project.id
    assert data["version_name"] == "v2.0.0"
    assert data["note"] == "Q3 release"


def test_create_release_rejects_unknown_project(client, auth_headers):
    response = client.post(
        "/releases",
        json={"project_id": 999999, "version_name": "v2.0.0"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_releases_by_project(client, auth_headers, project, db_session):
    from models.all_models import Project

    other_project = Project(name="Auto Loans", description="d")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)

    client.post("/releases", json={"project_id": project.id, "version_name": "v1.0.0"}, headers=auth_headers)
    client.post("/releases", json={"project_id": project.id, "version_name": "v2.0.0"}, headers=auth_headers)
    client.post("/releases", json={"project_id": other_project.id, "version_name": "v9.0.0"}, headers=auth_headers)

    response = client.get(f"/releases?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {item["version_name"] for item in data} == {"v1.0.0", "v2.0.0"}


def test_list_releases_rejects_unknown_project(client, auth_headers):
    response = client.get("/releases?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_releases_require_auth(client, project):
    response = client.get(f"/releases?project_id={project.id}")
    assert response.status_code == 401
