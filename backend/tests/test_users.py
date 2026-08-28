from services.auth_service import create_access_token


def test_list_users_requires_auth(client):
    response = client.get("/users")
    assert response.status_code == 401


def test_list_users_requires_superadmin(client, member_auth_headers):
    response = client.get("/users", headers=member_auth_headers)
    assert response.status_code == 403


def test_list_users_as_superadmin(client, auth_headers, test_user, member_user):
    response = client.get("/users", headers=auth_headers)
    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert {test_user.email, member_user.email} <= emails


def test_grant_can_create_projects(client, auth_headers, member_user):
    response = client.patch(
        f"/users/{member_user.id}",
        json={"can_create_projects": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["can_create_projects"] is True
    assert data["is_superadmin"] is False


def test_grant_and_revoke_superadmin(client, auth_headers, member_user, db_session):
    grant = client.patch(
        f"/users/{member_user.id}",
        json={"is_superadmin": True},
        headers=auth_headers,
    )
    assert grant.status_code == 200
    assert grant.json()["is_superadmin"] is True

    revoke = client.patch(
        f"/users/{member_user.id}",
        json={"is_superadmin": False},
        headers=auth_headers,
    )
    assert revoke.status_code == 200
    assert revoke.json()["is_superadmin"] is False


def test_cannot_remove_last_superadmin(client, auth_headers, test_user, db_session):
    # Shared dev DB may already have other superadmins committed (e.g. the
    # real SUPERADMIN_EMAIL account) — demote them within this rolled-back
    # transaction so test_user is actually the last one for this test.
    from models.all_models import User

    db_session.query(User).filter(User.is_superadmin.is_(True), User.id != test_user.id).update(
        {"is_superadmin": False}
    )
    db_session.commit()

    response = client.patch(
        f"/users/{test_user.id}",
        json={"is_superadmin": False},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot remove the last superadmin"


def test_superadmin_guard_lifts_once_a_second_superadmin_exists(
    client, auth_headers, test_user, member_user, db_session
):
    member_user.is_superadmin = True
    db_session.commit()

    response = client.patch(
        f"/users/{test_user.id}",
        json={"is_superadmin": False},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["is_superadmin"] is False


def test_update_user_requires_superadmin(client, member_auth_headers, test_user):
    response = client.patch(
        f"/users/{test_user.id}",
        json={"can_create_projects": True},
        headers=member_auth_headers,
    )
    assert response.status_code == 403


def test_update_user_not_found(client, auth_headers):
    response = client.patch(
        "/users/999999",
        json={"can_create_projects": True},
        headers=auth_headers,
    )
    assert response.status_code == 404
