"""add modules table, requirements.module_id FK; drop free-text module columns

Introduces a real modules table (project-scoped, unique per (project_id,
name)) to replace three independent dead/unmodeled string columns:
projects.modules (a Postgres array, never read by anything downstream --
same class of dead config as the retention_days column dropped in
b4e8f2a1c6d3), and the free-text module columns on requirements,
test_cases, and defects (only ever populated by seed.py, never exposed by
any create/edit UI). Test cases and defects now resolve their module only
transitively through their linked requirement's module_id.

Data step: before dropping requirements.module, back-fill modules from the
distinct (project_id, module) pairs already present and point
requirements.module_id at the matching row, so the live seeded Home
Lending System project's 50 requirements keep their module assignment
without requiring a reseed.

Revision ID: c7f3a9d2e158
Revises: b4e8f2a1c6d3
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7f3a9d2e158'
down_revision: Union[str, None] = 'b4e8f2a1c6d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'modules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.UniqueConstraint('project_id', 'name', name='uq_modules_project_name'),
    )

    op.add_column(
        'requirements',
        sa.Column('module_id', sa.Integer(), sa.ForeignKey('modules.id'), nullable=True),
    )

    # Data step: back-fill modules + requirements.module_id from the
    # existing free-text values before the source column is dropped below.
    op.execute(
        """
        INSERT INTO modules (project_id, name, created_at)
        SELECT DISTINCT project_id, module, now()
        FROM requirements
        WHERE module IS NOT NULL AND module <> ''
        """
    )
    op.execute(
        """
        UPDATE requirements r
        SET module_id = m.id
        FROM modules m
        WHERE m.project_id = r.project_id AND m.name = r.module
        """
    )

    op.drop_column('requirements', 'module')
    op.drop_column('test_cases', 'module')
    op.drop_column('defects', 'module')
    op.drop_column('projects', 'modules')


def downgrade() -> None:
    op.add_column('projects', sa.Column('modules', sa.ARRAY(sa.String()), server_default='{}'))
    op.add_column('test_cases', sa.Column('module', sa.String(length=100), nullable=True))
    op.add_column('defects', sa.Column('module', sa.String(length=100), nullable=True))
    op.add_column('requirements', sa.Column('module', sa.String(length=100), nullable=True))

    op.execute(
        """
        UPDATE requirements r
        SET module = m.name
        FROM modules m
        WHERE m.id = r.module_id
        """
    )

    op.drop_column('requirements', 'module_id')
    op.drop_table('modules')
