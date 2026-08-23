"""add ondelete=SET NULL to requirements.module_id FK; case-insensitive unique index on modules

Fixes two issues found in Task 2 code review of the modules CRUD API:
1. Deleting a module still referenced by a Deprecated (inactive) requirement raised a
   Postgres FK violation, since requirements.module_id had no ON DELETE behavior. The
   original app-level workaround (a bulk UPDATE nulling module_id before delete)
   violated the requirements-table append-only hard constraint. Moving the
   nullification to the DB's own referential-integrity action removes the need for any
   application-level UPDATE on requirements entirely.
2. The case-insensitive module-name-uniqueness check was enforced only in application
   code (a SELECT before INSERT), which has a TOCTOU race under concurrent requests -
   two simultaneous creates of "Payments" and "payments" could both succeed. A
   functional unique index on lower(name) closes this at the DB level.

Revision ID: d8a4f6c1b923
Revises: c7f3a9d2e158
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8a4f6c1b923'
down_revision: Union[str, None] = 'c7f3a9d2e158'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('requirements_module_id_fkey', 'requirements', type_='foreignkey')
    op.create_foreign_key(
        'requirements_module_id_fkey', 'requirements', 'modules',
        ['module_id'], ['id'], ondelete='SET NULL',
    )

    op.drop_constraint('uq_modules_project_name', 'modules', type_='unique')
    op.execute(
        "CREATE UNIQUE INDEX uq_modules_project_lower_name ON modules (project_id, lower(name))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_modules_project_lower_name")
    op.create_unique_constraint('uq_modules_project_name', 'modules', ['project_id', 'name'])

    op.drop_constraint('requirements_module_id_fkey', 'requirements', type_='foreignkey')
    op.create_foreign_key(
        'requirements_module_id_fkey', 'requirements', 'modules', ['module_id'], ['id'],
    )
