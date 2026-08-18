import logging
import os

import google.generativeai as genai
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from models.all_models import TestCase

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIM = 768
MAX_INPUT_CHARS = 8000


def _truncate_for_embedding(text: str) -> str:
    return text[:MAX_INPUT_CHARS]


def embed(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=_truncate_for_embedding(text),
        task_type=task_type,
        output_dimensionality=EMBEDDING_DIM,
    )
    return result["embedding"]


def build_test_case_text(tc: TestCase) -> str:
    parts = [tc.title, tc.preconditions or "", tc.steps or "", tc.expected_result]
    return "\n".join(p for p in parts if p)


def embed_and_store(db: Session, test_case_id: int) -> None:
    """Background-task entry point — must not raise.

    This runs after the HTTP response for POST/PUT /test-cases has already
    been sent, so an exception here (e.g. the Gemini API being down or
    misconfigured) cannot be surfaced to the client. Log and move on rather
    than letting a best-effort enrichment step fail the request.
    """
    tc = db.get(TestCase, test_case_id)
    if tc is None:
        return
    try:
        tc.embedding = embed(build_test_case_text(tc), task_type="RETRIEVAL_DOCUMENT")
        db.commit()
    except Exception:
        logger.exception("embed_and_store failed for test_case_id=%s", test_case_id)
