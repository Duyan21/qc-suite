"""drop unused retention_days column

retention_days was stored on projects but never wired to any actual
purge/archive/cleanup logic - no scheduler exists anywhere in this backend.
Dead scaffolding from the Admin settings mockup, same category as
slack_alerts_enabled (see a3b7c1d9e2f4). Removing it.

Revision ID: b4e8f2a1c6d3
Revises: a3b7c1d9e2f4
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4e8f2a1c6d3'
down_revision: Union[str, None] = 'a3b7c1d9e2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('projects', 'retention_days')


def downgrade() -> None:
    op.add_column('projects', sa.Column('retention_days', sa.Integer(), nullable=False, server_default='365'))
