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
