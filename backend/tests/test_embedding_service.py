import os

import pytest

from models.all_models import TestCase
from services.embedding_service import (
    EMBEDDING_DIM,
    MAX_INPUT_CHARS,
    _truncate_for_embedding,
    build_test_case_text,
    embed,
    embed_and_store,
)

requires_real_gemini_key = pytest.mark.skipif(
    os.getenv("GEMINI_API_KEY") in (None, "", "your-gemini-api-key-here"),
    reason="requires a real GEMINI_API_KEY in backend/.env",
)


def test_truncate_for_embedding_leaves_short_text_unchanged():
    assert _truncate_for_embedding("short text") == "short text"


def test_truncate_for_embedding_truncates_long_text():
    long_text = "a" * (MAX_INPUT_CHARS + 500)
    truncated = _truncate_for_embedding(long_text)
    assert len(truncated) == MAX_INPUT_CHARS


def test_build_test_case_text_joins_nonempty_fields():
    tc = TestCase(code="TC-1", title="Login", steps="Step 1", expected_result="OK")
    assert build_test_case_text(tc) == "Login\nStep 1\nOK"


def test_build_test_case_text_skips_missing_preconditions():
    tc = TestCase(code="TC-1", title="Login", expected_result="OK")
    text = build_test_case_text(tc)
    assert "None" not in text
    assert text == "Login\nOK"


@requires_real_gemini_key
def test_embed_returns_768_dim_vector():
    vector = embed("User can log in with email and password")
    assert len(vector) == EMBEDDING_DIM
    assert all(isinstance(x, float) for x in vector)


@requires_real_gemini_key
def test_embed_truncates_long_input_instead_of_erroring():
    long_text = "word " * 5000
    vector = embed(long_text)
    assert len(vector) == EMBEDDING_DIM


@requires_real_gemini_key
def test_embed_and_store_sets_embedding_column(db_session):
    tc = TestCase(
        code="TC-999",
        title="Placeholder",
        expected_result="n/a",
        priority="Low",
        status="Draft",
    )
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)

    embed_and_store(db_session, tc.id)

    db_session.refresh(tc)
    assert tc.embedding is not None
    assert len(tc.embedding) == EMBEDDING_DIM
