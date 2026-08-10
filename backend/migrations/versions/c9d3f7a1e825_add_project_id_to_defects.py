"""add project_id to defects

Revision ID: c9d3f7a1e825
Revises: 22f5ee720c10
Create Date: 2026-08-09 00:00:00.000000

NOTE: this adds a NOT NULL `project_id` column with no server_default and
no backfill, so `alembic upgrade head` will fail if the local `defects`
table already has rows (e.g. from manual testing or a prior `python
seed.py` run). If that happens (dev-only, no production data exists yet),
run:

    TRUNCATE defects CASCADE;

then re-run `alembic upgrade head`, and re-run `python seed.py` afterward
if you need seed data back.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d3f7a1e825'
down_revision: Union[str, None] = '22f5ee720c10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('defects', sa.Column('project_id', sa.Integer(), nullable=False))
    op.create_foreign_key(
        'defects_project_id_fkey', 'defects', 'projects', ['project_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('defects_project_id_fkey', 'defects', type_='foreignkey')
    op.drop_column('defects', 'project_id')
