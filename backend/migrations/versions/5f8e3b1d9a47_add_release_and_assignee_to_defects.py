"""add release_id and assignee_user_id to defects

Revision ID: 5f8e3b1d9a47
Revises: 9c1e2a4f7b56
Create Date: 2026-08-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5f8e3b1d9a47'
down_revision: Union[str, None] = '9c1e2a4f7b56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('defects', sa.Column('release_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'defects_release_id_fkey', 'defects', 'releases', ['release_id'], ['id'], ondelete='SET NULL',
    )
    op.add_column('defects', sa.Column('assignee_user_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'defects_assignee_user_id_fkey', 'defects', 'users', ['assignee_user_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('defects_assignee_user_id_fkey', 'defects', type_='foreignkey')
    op.drop_column('defects', 'assignee_user_id')
    op.drop_constraint('defects_release_id_fkey', 'defects', type_='foreignkey')
    op.drop_column('defects', 'release_id')
