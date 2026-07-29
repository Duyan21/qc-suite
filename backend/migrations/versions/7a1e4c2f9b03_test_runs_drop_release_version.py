"""test_runs: drop release_version, make release_id required

Revision ID: 7a1e4c2f9b03
Revises: 3359639bb387
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a1e4c2f9b03'
down_revision: Union[str, None] = '3359639bb387'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('test_runs', 'release_version')
    op.alter_column('test_runs', 'release_id', existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    op.alter_column('test_runs', 'release_id', existing_type=sa.Integer(), nullable=True)
    op.add_column('test_runs', sa.Column('release_version', sa.String(length=50), nullable=False))
