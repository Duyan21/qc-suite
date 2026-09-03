"""add reset_token and reset_token_exp to users

Revision ID: c3fe1eae739e
Revises: a1b2c3d4e5f6
Create Date: 2026-09-03 21:29:48.710663

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3fe1eae739e'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('reset_token', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('reset_token_exp', sa.TIMESTAMP(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'reset_token_exp')
    op.drop_column('users', 'reset_token')
