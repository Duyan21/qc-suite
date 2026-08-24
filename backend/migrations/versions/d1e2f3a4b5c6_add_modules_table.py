"""add modules table, drop dead module/modules columns

Revision ID: d1e2f3a4b5c6
Revises: b4e8f2a1c6d3
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'b4e8f2a1c6d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create modules table
    op.create_table(
        'modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'name', name='uq_modules_project_name')
    )

    # Add module_id to requirements
    op.add_column('requirements', sa.Column('module_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'requirements', 'modules', ['module_id'], ['id'])

    # Backfill module_id: extract distinct (project_id, module) pairs from requirements
    # and create corresponding Module records, then update requirements to point to them
    op.execute("""
        INSERT INTO modules (project_id, name)
        SELECT DISTINCT project_id, module
        FROM requirements
        WHERE module IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    # Update requirements to point to the new modules
    op.execute("""
        UPDATE requirements
        SET module_id = m.id
        FROM modules m
        WHERE requirements.module = m.name
        AND requirements.project_id = m.project_id
        AND requirements.module IS NOT NULL
    """)

    # Drop dead columns
    op.drop_column('requirements', 'module')
    op.drop_column('test_cases', 'module')
    op.drop_column('defects', 'module')
    op.drop_column('projects', 'modules')


def downgrade() -> None:
    # Recreate projects.modules array column
    op.add_column('projects', sa.Column('modules', sa.ARRAY(sa.String()), nullable=False, server_default='{}'))

    # Recreate defects.module column
    op.add_column('defects', sa.Column('module', sa.String(length=100), nullable=True))

    # Recreate test_cases.module column
    op.add_column('test_cases', sa.Column('module', sa.String(length=100), nullable=True))

    # Backfill requirements.module from module_id
    op.execute("""
        UPDATE requirements
        SET module = m.name
        FROM modules m
        WHERE requirements.module_id = m.id
    """)

    # Recreate requirements.module column
    op.add_column('requirements', sa.Column('module', sa.String(length=100), nullable=True))
    op.drop_constraint(None, 'requirements', type_='foreignkey')
    op.drop_column('requirements', 'module_id')

    # Drop modules table
    op.drop_table('modules')
