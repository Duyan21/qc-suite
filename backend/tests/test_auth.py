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


def test_register_creates_unverified_user_and_sends_email(client, db_session, monkeypatch):
    sent = {}

    def fake_send(to_email, full_name, token):
        sent["to_email"] = to_email
        sent["full_name"] = full_name
        sent["token"] = token

    monkeypatch.setattr("routers.auth.send_verification_email", fake_send)

    response = client.post(
        "/auth/register",
        json={"email": "new.user@example.com", "password": "password123", "full_name": "New User"},
    )
    assert response.status_code == 201
    assert response.json()["is_email_verified"] is False

    created = db_session.query(User).filter(User.email == "new.user@example.com").one()
    assert created.is_email_verified is False
    assert created.verification_token is not None
    assert created.verification_token_exp is not None

    assert sent["to_email"] == "new.user@example.com"
    assert sent["full_name"] == "New User"
    assert sent["token"] == created.verification_token


def test_verify_email_with_valid_token_activates_account(client, db_session):
    from services.auth_service import hash_password, utcnow_naive
    from datetime import timedelta

    user = User(
        email="pending@example.com",
        hashed_password=hash_password("password123"),
        is_email_verified=False,
        verification_token="valid-token-123",
        verification_token_exp=utcnow_naive() + timedelta(hours=24),
    )
    db_session.add(user)
    db_session.commit()

    response = client.post("/auth/verify-email", json={"token": "valid-token-123"})
    assert response.status_code == 200

    db_session.refresh(user)
    assert user.is_email_verified is True
    assert user.verification_token is None
    assert user.verification_token_exp is None


def test_verify_email_with_expired_token_fails(client, db_session):
    from services.auth_service import hash_password, utcnow_naive
    from datetime import timedelta

    user = User(
        email="expired@example.com",
        hashed_password=hash_password("password123"),
        is_email_verified=False,
        verification_token="expired-token",
        verification_token_exp=utcnow_naive() - timedelta(hours=1),
    )
    db_session.add(user)
    db_session.commit()

    response = client.post("/auth/verify-email", json={"token": "expired-token"})
    assert response.status_code == 400


def test_verify_email_with_unknown_token_fails(client):
    response = client.post("/auth/verify-email", json={"token": "does-not-exist"})
    assert response.status_code == 400


def test_resend_verification_issues_a_new_token_and_invalidates_the_old_one(client, db_session, monkeypatch):
    from services.auth_service import hash_password, utcnow_naive
    from datetime import timedelta

    sent = []
    monkeypatch.setattr(
        "routers.auth.send_verification_email",
        lambda to_email, full_name, token: sent.append(token),
    )

    user = User(
        email="resend@example.com",
        hashed_password=hash_password("password123"),
        is_email_verified=False,
        verification_token="old-token",
        verification_token_exp=utcnow_naive() + timedelta(hours=24),
    )
    db_session.add(user)
    db_session.commit()

    response = client.post("/auth/resend-verification", json={"email": "resend@example.com"})
    assert response.status_code == 200
    assert len(sent) == 1
    new_token = sent[0]
    assert new_token != "old-token"

    # the old token no longer verifies
    old_response = client.post("/auth/verify-email", json={"token": "old-token"})
    assert old_response.status_code == 400

    # the new token does
    new_response = client.post("/auth/verify-email", json={"token": new_token})
    assert new_response.status_code == 200


def test_resend_verification_is_a_generic_response_for_unknown_or_verified_email(client, db_session, test_user, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "routers.auth.send_verification_email",
        lambda to_email, full_name, token: sent.append(token),
    )

    # test_user fixture has no is_email_verified set explicitly -> defaults
    # False at the ORM level, so mark it verified first to exercise the
    # "already verified" branch specifically.
    test_user.is_email_verified = True
    db_session.commit()

    verified_response = client.post("/auth/resend-verification", json={"email": test_user.email})
    assert verified_response.status_code == 200

    unknown_response = client.post("/auth/resend-verification", json={"email": "nobody@example.com"})
    assert unknown_response.status_code == 200

    assert sent == []
