from models.all_models import Requirement
from services.code_generator import next_code


def test_next_code_starts_at_001_when_empty(db_session):
    code = next_code(db_session, Requirement, "req_id", "REQ")
    assert code == "REQ-001"


def test_next_code_increments_from_existing(db_session):
    db_session.add(
        Requirement(
            req_id="REQ-001",
            version=1,
            title="Existing",
            description="d",
            status="Active",
            is_current=True,
        )
    )
    db_session.commit()

    code = next_code(db_session, Requirement, "req_id", "REQ")
    assert code == "REQ-002"


def test_next_code_ignores_other_prefixes(db_session):
    db_session.add(
        Requirement(
            req_id="REQ-001",
            version=1,
            title="Existing",
            description="d",
            status="Active",
            is_current=True,
        )
    )
    db_session.commit()

    code = next_code(db_session, Requirement, "req_id", "OTHER")
    assert code == "OTHER-001"
