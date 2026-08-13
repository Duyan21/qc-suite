"""add module to requirements, test_cases, defects

Revision ID: e36236c9b069
Revises: c9d3f7a1e825
Create Date: 2026-08-12 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e36236c9b069'
down_revision: Union[str, None] = 'c9d3f7a1e825'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('requirements', sa.Column('module', sa.String(length=100), nullable=True))
    op.add_column('test_cases', sa.Column('module', sa.String(length=100), nullable=True))
    op.add_column('defects', sa.Column('module', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('defects', 'module')
    op.drop_column('test_cases', 'module')
    op.drop_column('requirements', 'module')
