import uuid

from models.all_models import Project, Requirement
from services.code_generator import next_code


def _create_project(db_session):
    project = Project(name="Home Lending", description="d", key="CGN")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _unique_prefix() -> str:
    # A fresh, all-caps prefix per call guarantees no collision with real
    # seed data or other tests sharing the dev DB, without depending on the
    # table actually being empty.
    return f"ZZ{uuid.uuid4().hex[:8].upper()}"


def test_next_code_starts_at_001_when_empty(db_session):
    prefix = _unique_prefix()
    code = next_code(db_session, Requirement, "req_id", prefix)
    assert code == f"{prefix}-001"


def test_next_code_increments_from_existing(db_session):
    project = _create_project(db_session)
    prefix = _unique_prefix()
    db_session.add(
        Requirement(
            req_id=f"{prefix}-001",
            version=1,
            title="Existing",
            description="d",
            status="Active",
            is_current=True,
            project_id=project.id,
        )
    )
    db_session.commit()

    code = next_code(db_session, Requirement, "req_id", prefix)
    assert code == f"{prefix}-002"


def test_next_code_ignores_other_prefixes(db_session):
    project = _create_project(db_session)
    prefix_a = _unique_prefix()
    prefix_b = _unique_prefix()
    db_session.add(
        Requirement(
            req_id=f"{prefix_a}-001",
            version=1,
            title="Existing",
            description="d",
            status="Active",
            is_current=True,
            project_id=project.id,
        )
    )
    db_session.commit()

    code = next_code(db_session, Requirement, "req_id", prefix_b)
    assert code == f"{prefix_b}-001"
