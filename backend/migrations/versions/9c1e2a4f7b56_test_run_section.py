"""test run section: release_test_cases, release_test_case_executions,
execution_evidence_images; releases gains status/target_date/owner_user_id;
drops test_runs/test_run_results

Revision ID: 9c1e2a4f7b56
Revises: 31b20386c48e
Create Date: 2026-08-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c1e2a4f7b56'
down_revision: Union[str, None] = '31b20386c48e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('releases', sa.Column('status', sa.String(20), nullable=False, server_default='New'))
    op.add_column('releases', sa.Column('target_date', sa.Date(), nullable=True))
    op.add_column('releases', sa.Column('owner_user_id', sa.Integer(), nullable=True))
    op.create_foreign_key('releases_owner_user_id_fkey', 'releases', 'users', ['owner_user_id'], ['id'])

    op.drop_table('test_run_results')
    op.drop_table('test_runs')

    op.create_table(
        'release_test_cases',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('release_id', sa.Integer(), sa.ForeignKey('releases.id'), nullable=False),
        sa.Column('testcase_id', sa.Integer(), sa.ForeignKey('test_cases.id'), nullable=False),
        sa.Column('current_result', sa.String(10), nullable=False, server_default='NotRun'),
        sa.Column('added_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('added_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.UniqueConstraint('release_id', 'testcase_id', name='uq_release_testcase'),
    )
    op.create_table(
        'release_test_case_executions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('release_test_case_id', sa.Integer(), sa.ForeignKey('release_test_cases.id'), nullable=False),
        sa.Column('result', sa.String(10), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('executed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('executed_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )
    op.create_table(
        'execution_evidence_images',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('execution_id', sa.Integer(), sa.ForeignKey('release_test_case_executions.id'), nullable=False),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('uploaded_at', sa.TIMESTAMP(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('execution_evidence_images')
    op.drop_table('release_test_case_executions')
    op.drop_table('release_test_cases')

    op.create_table(
        'test_runs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('release_id', sa.Integer(), sa.ForeignKey('releases.id'), nullable=False),
        sa.Column('executed_at', sa.TIMESTAMP(), server_default=sa.func.now()),
        sa.Column('executed_by', sa.String(100), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
    )
    op.create_table(
        'test_run_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('run_id', sa.Integer(), sa.ForeignKey('test_runs.id'), nullable=False),
        sa.Column('testcase_id', sa.Integer(), sa.ForeignKey('test_cases.id'), nullable=False),
        sa.Column('result', sa.String(20), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.UniqueConstraint('run_id', 'testcase_id', name='uq_run_testcase'),
    )

    op.drop_constraint('releases_owner_user_id_fkey', 'releases', type_='foreignkey')
    op.drop_column('releases', 'owner_user_id')
    op.drop_column('releases', 'target_date')
    op.drop_column('releases', 'status')
