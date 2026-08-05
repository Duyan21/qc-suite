def test_me_returns_current_user(client, auth_headers, test_user):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_user.id
    assert data["email"] == test_user.email
    assert data["full_name"] == test_user.full_name
    assert data["is_active"] is True


def test_me_requires_auth(client):
    response = client.get("/auth/me")
    assert response.status_code == 401
