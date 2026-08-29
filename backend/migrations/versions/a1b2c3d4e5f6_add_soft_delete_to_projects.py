"""add is_deleted/deleted_at soft-delete columns to projects

Revision ID: a1b2c3d4e5f6
Revises: 5f8e3b1d9a47
Create Date: 2026-08-29 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '5f8e3b1d9a47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('projects', sa.Column('deleted_at', sa.TIMESTAMP(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'deleted_at')
    op.drop_column('projects', 'is_deleted')
