"""add email verification and reset token columns to users

Revision ID: b7c4e91a3f28
Revises: a1b2c3d4e5f6
Create Date: 2026-09-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c4e91a3f28'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('is_email_verified', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('users', sa.Column('verification_token', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('verification_token_exp', sa.TIMESTAMP(), nullable=True))
    op.add_column('users', sa.Column('reset_token', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('reset_token_exp', sa.TIMESTAMP(), nullable=True))

    # Every account that existed before this migration was already usable —
    # only accounts created after this ships should start unverified.
    op.execute('UPDATE users SET is_email_verified = true')


def downgrade() -> None:
    op.drop_column('users', 'reset_token_exp')
    op.drop_column('users', 'reset_token')
    op.drop_column('users', 'verification_token_exp')
    op.drop_column('users', 'verification_token')
    op.drop_column('users', 'is_email_verified')
