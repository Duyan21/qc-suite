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


from models.all_models import (
    ExecutionEvidenceImage,
    Project,
    ProjectMember,
    Release,
    ReleaseTestCase,
    ReleaseTestCaseExecution,
    User,
)


def test_first_ever_user_becomes_superadmin(client, db_session):
    # This repo's tests run against a real shared dev DB, not a fresh DB per
    # run — the users table is very likely NOT empty (manually-registered
    # test accounts from earlier sprints). We're inside this test's own
    # transaction (see conftest.py's db_session fixture docstring), so
    # clearing it here is fully safe and reversible: it never touches real
    # committed data, it just makes the "empty table" precondition true for
    # the duration of this one test.
    #
    # The shared dev DB also has committed project_members rows,
    # projects.lead_user_id values, releases.owner_user_id values, and
    # release-run rows (added by the RBAC schema in tasks 1-4 and the Test
    # Runs / Release Report seed data) that FK-reference existing users, so a
    # plain `DELETE FROM users` fails with a ForeignKeyViolation. Clear those
    # referencing rows first — still entirely inside this test's own
    # transaction, still fully reversible.
    db_session.query(ExecutionEvidenceImage).delete()
    db_session.query(ReleaseTestCaseExecution).delete()
    db_session.query(ReleaseTestCase).delete()
    db_session.query(Release).update({Release.owner_user_id: None})
    db_session.query(ProjectMember).delete()
    db_session.query(Project).update({Project.lead_user_id: None})
    db_session.query(User).delete()
    db_session.commit()

    assert db_session.query(User).count() == 0

    response = client.post(
        "/auth/register",
        json={"email": "first@example.com", "password": "password123", "full_name": "First User"},
    )
    assert response.status_code == 201
    created = db_session.query(User).filter(User.email == "first@example.com").one()
    assert created.is_superadmin is True


def test_second_user_is_not_superadmin(client, db_session, test_user):
    response = client.post(
        "/auth/register",
        json={"email": "second@example.com", "password": "password123", "full_name": "Second User"},
    )
    assert response.status_code == 201
    created = db_session.query(User).filter(User.email == "second@example.com").one()
    assert created.is_superadmin is False


def test_suspended_user_cannot_login(client, db_session):
    from services.auth_service import hash_password

    user = User(
        email="suspended@example.com",
        hashed_password=hash_password("password123"),
        status="Suspended",
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login", json={"email": "suspended@example.com", "password": "password123"}
    )
    assert response.status_code == 403


def test_invited_user_with_empty_password_gets_401_not_500(client, db_session):
    """invite_member creates a User with hashed_password="" (no accept-invite
    flow yet). bcrypt.checkpw(..., b"") raises ValueError -> unhandled 500 on
    the public login endpoint. Must be a clean 401 instead."""
    user = User(email="invited.no.password@example.com", hashed_password="", status="Invited")
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login",
        json={"email": "invited.no.password@example.com", "password": "anything-at-all"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_forgot_password_returns_token_for_existing_user(client, db_session):
    from services.auth_service import hash_password

    user = User(email="fp.known@example.com", hashed_password=hash_password("OldPassw0rd!"))
    db_session.add(user)
    db_session.commit()

    response = client.post("/auth/forgot-password", json={"email": "fp.known@example.com"})
    assert response.status_code == 200
    data = response.json()
    assert data["reset_token"]
    assert data["expires_in"] == "15 minutes"

    db_session.refresh(user)
    assert user.reset_token == data["reset_token"]
    assert user.reset_token_exp is not None


def test_forgot_password_same_response_shape_for_unknown_email(client):
    """Must not leak whether the email exists — same status code and shape either way."""
    response = client.post("/auth/forgot-password", json={"email": "does.not.exist@example.com"})
    assert response.status_code == 200
    data = response.json()
    assert data["reset_token"]
    assert data["expires_in"] == "15 minutes"


def test_forgot_password_unknown_email_does_not_write_to_any_user(client, db_session, test_user):
    response = client.post("/auth/forgot-password", json={"email": "does.not.exist@example.com"})
    token = response.json()["reset_token"]

    reset_response = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "WhateverPass1!"}
    )
    assert reset_response.status_code == 400

    db_session.refresh(test_user)
    assert test_user.reset_token is None


def test_reset_password_with_valid_token_changes_password_and_is_single_use(client, db_session):
    from services.auth_service import hash_password

    user = User(email="fp.reset@example.com", hashed_password=hash_password("OldPassw0rd!"))
    db_session.add(user)
    db_session.commit()

    token = client.post("/auth/forgot-password", json={"email": "fp.reset@example.com"}).json()["reset_token"]

    response = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "NewPassw0rd!"}
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Password reset successful"}

    old_login = client.post(
        "/auth/login", json={"email": "fp.reset@example.com", "password": "OldPassw0rd!"}
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/auth/login", json={"email": "fp.reset@example.com", "password": "NewPassw0rd!"}
    )
    assert new_login.status_code == 200

    reused = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "AnotherPass1!"}
    )
    assert reused.status_code == 400
    assert reused.json()["detail"] == "Invalid or expired token"


def test_reset_password_rejects_unknown_token(client):
    response = client.post(
        "/auth/reset-password", json={"token": "totally-bogus-token", "new_password": "WhateverPass1!"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or expired token"


def test_reset_password_rejects_expired_token(client, db_session):
    from datetime import datetime, timedelta

    from services.auth_service import hash_password

    user = User(email="fp.expired@example.com", hashed_password=hash_password("OldPassw0rd!"))
    db_session.add(user)
    db_session.commit()

    token = client.post("/auth/forgot-password", json={"email": "fp.expired@example.com"}).json()["reset_token"]
    user.reset_token_exp = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()

    response = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "NewPassw0rd!"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or expired token"


def test_reset_password_rejects_short_new_password(client):
    response = client.post(
        "/auth/reset-password", json={"token": "whatever", "new_password": "short"}
    )
    assert response.status_code == 422
