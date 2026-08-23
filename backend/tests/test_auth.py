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


from models.all_models import Project, ProjectMember, User


def test_first_ever_user_becomes_superadmin(client, db_session):
    # This repo's tests run against a real shared dev DB, not a fresh DB per
    # run — the users table is very likely NOT empty (manually-registered
    # test accounts from earlier sprints). We're inside this test's own
    # transaction (see conftest.py's db_session fixture docstring), so
    # clearing it here is fully safe and reversible: it never touches real
    # committed data, it just makes the "empty table" precondition true for
    # the duration of this one test.
    #
    # The shared dev DB also has committed project_members rows and
    # projects.lead_user_id values that FK-reference existing users (added
    # by the RBAC schema in tasks 1-4), so a plain `DELETE FROM users` fails
    # with a ForeignKeyViolation. Clear those referencing rows first — still
    # entirely inside this test's own transaction, still fully reversible.
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
