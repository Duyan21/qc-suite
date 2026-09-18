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
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login", json={"email": "suspended@example.com", "password": "password123"}
    )
    assert response.status_code == 403


def test_unverified_user_cannot_login(client, db_session):
    from services.auth_service import hash_password

    user = User(
        email="unverified@example.com",
        hashed_password=hash_password("password123"),
        is_email_verified=False,
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login", json={"email": "unverified@example.com", "password": "password123"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Email not verified"


def test_verified_user_can_login(client, db_session):
    from services.auth_service import hash_password

    user = User(
        email="verified@example.com",
        hashed_password=hash_password("password123"),
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login", json={"email": "verified@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


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
    assert (
        response.json()["message"]
        == "Nếu tài khoản tồn tại và chưa xác thực, một email xác thực mới đã được gửi."
    )

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

    # message text must be identical across both no-op branches, so neither
    # account existence nor verification status can be enumerated from it
    assert verified_response.json()["message"] == unknown_response.json()["message"]
    # and identical to the message returned when a new token IS issued
    # (test_resend_verification_issues_a_new_token_and_invalidates_the_old_one),
    # so message content can't be used to distinguish any of the three cases
    assert (
        verified_response.json()["message"]
        == "Nếu tài khoản tồn tại và chưa xác thực, một email xác thực mới đã được gửi."
    )

    assert sent == []


def test_forgot_password_sends_email_and_does_not_leak_token(client, db_session, test_user, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "routers.auth.send_reset_email",
        lambda to_email, full_name, token: sent.append(token),
    )

    response = client.post("/auth/forgot-password", json={"email": test_user.email})
    assert response.status_code == 200
    assert "token" not in response.json()
    assert response.json() == {"message": response.json()["message"]}  # only a message field
    assert len(sent) == 1

    db_session.refresh(test_user)
    assert test_user.reset_token == sent[0]
    assert test_user.reset_token_exp is not None


def test_forgot_password_unknown_email_still_returns_200(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "routers.auth.send_reset_email",
        lambda to_email, full_name, token: sent.append(token),
    )

    response = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 200
    assert sent == []


def test_reset_password_with_valid_token_changes_password(client, db_session, test_user, monkeypatch):
    monkeypatch.setattr("routers.auth.send_reset_email", lambda *a, **k: None)
    client.post("/auth/forgot-password", json={"email": test_user.email})
    db_session.refresh(test_user)
    token = test_user.reset_token

    response = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "newpassword456"}
    )
    assert response.status_code == 200

    db_session.refresh(test_user)
    assert test_user.reset_token is None
    assert test_user.reset_token_exp is None

    from services.auth_service import verify_password
    assert verify_password("newpassword456", test_user.hashed_password)


def test_only_latest_reset_token_works(client, db_session, test_user, monkeypatch):
    tokens = []
    monkeypatch.setattr(
        "routers.auth.send_reset_email",
        lambda to_email, full_name, token: tokens.append(token),
    )

    client.post("/auth/forgot-password", json={"email": test_user.email})
    first_token = tokens[0]

    client.post("/auth/forgot-password", json={"email": test_user.email})
    second_token = tokens[1]
    assert second_token != first_token

    old_response = client.post(
        "/auth/reset-password", json={"token": first_token, "new_password": "whatever123"}
    )
    assert old_response.status_code == 400

    new_response = client.post(
        "/auth/reset-password", json={"token": second_token, "new_password": "whatever123"}
    )
    assert new_response.status_code == 200


def test_reset_password_with_expired_token_fails(client, db_session, test_user):
    from services.auth_service import utcnow_naive
    from datetime import timedelta

    test_user.reset_token = "expired-reset-token"
    test_user.reset_token_exp = utcnow_naive() - timedelta(hours=1)
    db_session.commit()

    response = client.post(
        "/auth/reset-password", json={"token": "expired-reset-token", "new_password": "whatever123"}
    )
    assert response.status_code == 400


def test_reset_password_with_unknown_token_fails(client):
    response = client.post(
        "/auth/reset-password", json={"token": "does-not-exist", "new_password": "whatever123"}
    )
    assert response.status_code == 400
