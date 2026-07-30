from models.all_models import TestCase
from services.embedding_service import trigger_embedding


def test_trigger_embedding_is_a_noop():
    tc = TestCase(
        code="TC-999",
        title="Placeholder",
        expected_result="n/a",
        priority="Low",
        status="Draft",
    )
    assert trigger_embedding(tc) is None
