"""add agent cache table

Revision ID: 31b20386c48e
Revises: d8a4f6c1b923
Create Date: 2026-08-24 01:27:05.583211

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '31b20386c48e'
down_revision: Union[str, None] = 'd8a4f6c1b923'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cache_key", sa.String(length=64), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.UniqueConstraint("cache_key", name="uq_agent_cache_cache_key"),
    )


def downgrade() -> None:
    op.drop_table("agent_cache")
