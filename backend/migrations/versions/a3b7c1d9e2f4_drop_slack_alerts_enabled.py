"""drop unused slack_alerts_enabled column

slack_alerts_enabled was stored on projects but never wired to any actual
Slack notification logic (no webhook call, no notification service) -
dead scaffolding from the Admin settings mockup. Removing it.

Revision ID: a3b7c1d9e2f4
Revises: f1a2b3c4d5e6
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3b7c1d9e2f4'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('projects', 'slack_alerts_enabled')


def downgrade() -> None:
    op.add_column('projects', sa.Column('slack_alerts_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
