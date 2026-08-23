import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from main import app
from models.base import engine, get_db
from models.all_models import Project, User, ProjectMember, Role
from services.auth_service import create_access_token


@pytest.fixture()
def db_session():
    """Each test runs inside a transaction that's rolled back afterward —
    hits the real dev DB (per project convention: no chunking/mocking of
    infra) but never leaves data behind."""
    connection = engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = TestingSessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def test_user(db_session):
    user = User(
        email="qc.engineer@example.com",
        hashed_password="not-used-in-tests",
        full_name="QC Engineer",
        is_superadmin=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def auth_headers(test_user):
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def project(db_session):
    proj = Project(name="Home Lending", description="d", key="HLD")
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


@pytest.fixture()
def role_by_key(db_session):
    def _get(key: str) -> Role:
        role = db_session.query(Role).filter(Role.key == key).one()
        return role
    return _get


@pytest.fixture()
def member_user(db_session):
    """A non-superadmin user, used to test permission denial and per-project scoping."""
    user = User(
        email="member@example.com",
        hashed_password="not-used-in-tests",
        full_name="Project Member",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def member_auth_headers(member_user):
    token = create_access_token(member_user.id)
    return {"Authorization": f"Bearer {token}"}


def make_project_member(db_session, project, user, role_key):
    role = db_session.query(Role).filter(Role.key == role_key).one()
    membership = ProjectMember(project_id=project.id, user_id=user.id, role_id=role.id)
    db_session.add(membership)
    db_session.commit()
    return membership
