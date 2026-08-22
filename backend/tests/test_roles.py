def test_list_roles_returns_five_seeded_roles(client, auth_headers):
    response = client.get("/roles", headers=auth_headers)
    assert response.status_code == 200
    keys = {r["key"] for r in response.json()}
    assert keys == {"admin", "qa_lead", "tester", "developer", "viewer"}


def test_get_permission_matrix(client, auth_headers):
    response = client.get("/permissions/matrix", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["roles"]) == 5
    admin_requirements = next(
        c for c in data["cells"] if c["role_key"] == "admin" and c["area"] == "requirements"
    )
    assert admin_requirements["level"] == "full"


def test_update_permission_matrix_requires_superadmin(client, member_auth_headers):
    response = client.put(
        "/permissions/matrix",
        json={"cells": [{"role_key": "viewer", "area": "requirements", "level": "edit"}]},
        headers=member_auth_headers,
    )
    assert response.status_code == 403


def test_update_permission_matrix_as_superadmin(client, auth_headers):
    response = client.put(
        "/permissions/matrix",
        json={"cells": [{"role_key": "viewer", "area": "requirements", "level": "edit"}]},
        headers=auth_headers,
    )
    assert response.status_code == 200

    matrix = client.get("/permissions/matrix", headers=auth_headers).json()
    cell = next(c for c in matrix["cells"] if c["role_key"] == "viewer" and c["area"] == "requirements")
    assert cell["level"] == "edit"
