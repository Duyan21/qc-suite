"""add hnsw index to test_cases embedding

Revision ID: 8d235eaf6397
Revises: e36236c9b069
Create Date: 2026-08-18 23:26:43.820598

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d235eaf6397'
down_revision: Union[str, None] = 'e36236c9b069'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX test_cases_embedding_hnsw_idx ON test_cases "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX test_cases_embedding_hnsw_idx")
