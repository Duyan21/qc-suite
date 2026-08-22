from services.auth_service import create_access_token, create_reset_token


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


def test_forgot_password_known_email_returns_generic_message(client, test_user):
    response = client.post("/auth/forgot-password", json={"email": test_user.email})
    assert response.status_code == 200
    data = response.json()
    assert "reset_token" not in data
    assert data["message"]


def test_forgot_password_unknown_email_returns_same_generic_message(client):
    response = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 200
    data = response.json()
    assert "reset_token" not in data
    assert data["message"]


def test_reset_password_with_valid_token_updates_password(client, test_user):
    token = create_reset_token(test_user.id)
    response = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "new-password-123"},
    )
    assert response.status_code == 200
    assert response.json()["id"] == test_user.id

    login_response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "new-password-123"},
    )
    assert login_response.status_code == 200


def test_reset_password_rejects_access_token(client, test_user):
    access_token = create_access_token(test_user.id)
    response = client.post(
        "/auth/reset-password",
        json={"token": access_token, "new_password": "new-password-123"},
    )
    assert response.status_code == 401


def test_reset_password_rejects_invalid_token(client):
    response = client.post(
        "/auth/reset-password",
        json={"token": "not-a-real-token", "new_password": "new-password-123"},
    )
    assert response.status_code == 401
