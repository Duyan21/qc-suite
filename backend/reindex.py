"""CLI script to embed any test cases missing a vector (S2-05).

Run from backend/ with the venv active and the DB up:
    python reindex.py

Safe to re-run: it only processes rows where embedding IS NULL, so a
transient failure on one row just gets picked up on the next run instead of
losing progress on the rest of the batch.
"""
import time

from models.all_models import TestCase
from models.base import SessionLocal
from services.embedding_service import build_test_case_text, embed


def main() -> None:
    db = SessionLocal()
    try:
        pending = db.query(TestCase).filter(TestCase.embedding.is_(None)).all()
        total = len(pending)
        for i, tc in enumerate(pending, start=1):
            try:
                tc.embedding = embed(
                    build_test_case_text(tc), task_type="RETRIEVAL_DOCUMENT"
                )
                db.commit()
                print(f"Embedding TC {i}/{total}...")
            except Exception as exc:
                db.rollback()
                print(f"Embedding TC {i}/{total} FAILED ({tc.code}): {exc}")
            time.sleep(0.1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
