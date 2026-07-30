"""add project_id to requirements

Revision ID: 22f5ee720c10
Revises: 7a1e4c2f9b03
Create Date: 2026-07-30 23:37:48.069205

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '22f5ee720c10'
down_revision: Union[str, None] = '7a1e4c2f9b03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('requirements', sa.Column('project_id', sa.Integer(), nullable=False))
    op.create_foreign_key(
        'requirements_project_id_fkey', 'requirements', 'projects', ['project_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('requirements_project_id_fkey', 'requirements', type_='foreignkey')
    op.drop_column('requirements', 'project_id')
