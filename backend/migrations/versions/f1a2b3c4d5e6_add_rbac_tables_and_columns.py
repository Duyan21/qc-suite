"""add rbac tables and columns

Revision ID: f1a2b3c4d5e6
Revises: 8d235eaf6397
Create Date: 2026-08-22 00:00:00.000000

Backfill note: this repo has no existing project_members concept at all —
any authenticated user can already reach any project's data today. The
backfill below makes every existing user an Admin member of every existing
project, so nobody who could reach a project yesterday gets 403'd tomorrow.
A superadmin can dial individual people back via the new Users & Access UI
once this migration lands.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '8d235eaf6397'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROLE_SEED = [
    ("admin", "Admin"),
    ("qa_lead", "QA Lead"),
    ("tester", "Tester"),
    ("developer", "Developer"),
    ("viewer", "Viewer"),
]

# area -> {role_key: level}, matching the mockup's matrix exactly.
PERMISSION_SEED = {
    "project_settings": {"admin": "full", "qa_lead": "edit", "tester": "read", "developer": "read", "viewer": "none"},
    "members_roles": {"admin": "full", "qa_lead": "edit", "tester": "none", "developer": "none", "viewer": "none"},
    "requirements": {"admin": "full", "qa_lead": "full", "tester": "read", "developer": "edit", "viewer": "read"},
    "test_cases": {"admin": "full", "qa_lead": "full", "tester": "edit", "developer": "read", "viewer": "read"},
    "test_runs": {"admin": "full", "qa_lead": "full", "tester": "edit", "developer": "read", "viewer": "read"},
    "defects": {"admin": "full", "qa_lead": "full", "tester": "edit", "developer": "edit", "viewer": "read"},
    "ai_tools": {"admin": "full", "qa_lead": "edit", "tester": "edit", "developer": "read", "viewer": "none"},
    "audit_log": {"admin": "full", "qa_lead": "read", "tester": "none", "developer": "none", "viewer": "none"},
}


def upgrade() -> None:
    # --- users: new columns ---
    op.add_column('users', sa.Column('status', sa.String(20), nullable=False, server_default='Active'))
    op.add_column('users', sa.Column('is_superadmin', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('can_create_projects', sa.Boolean(), nullable=False, server_default=sa.false()))

    # --- projects: new columns ---
    op.add_column('projects', sa.Column('key', sa.String(20), nullable=True))
    op.add_column('projects', sa.Column('lead_user_id', sa.Integer(), nullable=True))
    op.create_foreign_key('projects_lead_user_id_fkey', 'projects', 'users', ['lead_user_id'], ['id'])
    op.add_column('projects', sa.Column('modules', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'))
    op.add_column('projects', sa.Column('status', sa.String(20), nullable=False, server_default='Active'))
    op.add_column('projects', sa.Column('require_requirement_link', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('projects', sa.Column('auto_resolve_days', sa.Integer(), nullable=True))
    op.add_column('projects', sa.Column('ai_impact_suggestions', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('projects', sa.Column('slack_alerts_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('projects', sa.Column('retention_days', sa.Integer(), nullable=False, server_default='365'))
    op.add_column('projects', sa.Column('default_severity', sa.String(20), nullable=False, server_default='Medium'))

    # --- roles / role_permissions / project_members tables ---
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(20), nullable=False, unique=True),
        sa.Column('name', sa.String(50), nullable=False),
    )
    op.create_table(
        'role_permissions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=False),
        sa.Column('area', sa.String(30), nullable=False),
        sa.Column('level', sa.String(10), nullable=False),
        sa.UniqueConstraint('role_id', 'area', name='uq_role_permissions_role_area'),
    )
    op.create_table(
        'project_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.UniqueConstraint('project_id', 'user_id', name='uq_project_members_project_user'),
    )

    conn = op.get_bind()

    # --- seed roles + role_permissions ---
    roles_table = sa.table('roles', sa.column('id', sa.Integer), sa.column('key', sa.String), sa.column('name', sa.String))
    role_ids = {}
    for key, name in ROLE_SEED:
        result = conn.execute(roles_table.insert().values(key=key, name=name).returning(roles_table.c.id))
        role_ids[key] = result.scalar_one()

    role_permissions_table = sa.table(
        'role_permissions', sa.column('role_id', sa.Integer), sa.column('area', sa.String), sa.column('level', sa.String)
    )
    for area, levels in PERMISSION_SEED.items():
        for role_key, level in levels.items():
            conn.execute(role_permissions_table.insert().values(role_id=role_ids[role_key], area=area, level=level))

    # --- backfill projects.key from name (uppercase initials, de-duplicated) ---
    projects_table = sa.table('projects', sa.column('id', sa.Integer), sa.column('name', sa.String), sa.column('key', sa.String))
    existing_projects = conn.execute(sa.select(projects_table.c.id, projects_table.c.name)).all()
    used_keys = set()
    for pid, name in existing_projects:
        base_key = ''.join(w[0] for w in name.split() if w)[:6].upper() or 'PRJ'
        candidate = base_key
        suffix = 1
        while candidate in used_keys:
            suffix += 1
            candidate = f"{base_key}{suffix}"
        used_keys.add(candidate)
        conn.execute(projects_table.update().where(projects_table.c.id == pid).values(key=candidate))
    op.alter_column('projects', 'key', nullable=False)
    op.create_unique_constraint('uq_projects_key', 'projects', ['key'])

    # --- backfill project_members: every existing user gets Admin on every existing project ---
    users_table = sa.table('users', sa.column('id', sa.Integer))
    existing_user_ids = [row[0] for row in conn.execute(sa.select(users_table.c.id)).all()]
    project_members_table = sa.table(
        'project_members',
        sa.column('project_id', sa.Integer), sa.column('user_id', sa.Integer), sa.column('role_id', sa.Integer),
    )
    admin_role_id = role_ids['admin']
    for pid, _ in existing_projects:
        for uid in existing_user_ids:
            conn.execute(project_members_table.insert().values(project_id=pid, user_id=uid, role_id=admin_role_id))


def downgrade() -> None:
    op.drop_table('project_members')
    op.drop_table('role_permissions')
    op.drop_table('roles')

    op.drop_constraint('uq_projects_key', 'projects', type_='unique')
    op.drop_column('projects', 'default_severity')
    op.drop_column('projects', 'retention_days')
    op.drop_column('projects', 'slack_alerts_enabled')
    op.drop_column('projects', 'ai_impact_suggestions')
    op.drop_column('projects', 'auto_resolve_days')
    op.drop_column('projects', 'require_requirement_link')
    op.drop_column('projects', 'status')
    op.drop_column('projects', 'modules')
    op.drop_constraint('projects_lead_user_id_fkey', 'projects', type_='foreignkey')
    op.drop_column('projects', 'lead_user_id')
    op.drop_column('projects', 'key')

    op.drop_column('users', 'can_create_projects')
    op.drop_column('users', 'is_superadmin')
    op.drop_column('users', 'status')
