"""add ledger reconciliation audit tables

Revision ID: 79b9f274292e
Revises: 0dda01c45c70
Create Date: 2026-09-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = '79b9f274292e'
down_revision: Union[str, None] = '0dda01c45c70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'gl_ledger_state',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('round_id', sa.Integer(), nullable=False),
        sa.Column('entity_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('points', sa.Float(), nullable=False),
        sa.Column('payload_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('round_id', 'entity_type', 'entity_id'),
    )
    with op.batch_alter_table('gl_ledger_state', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_gl_ledger_state_round_id'), ['round_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gl_ledger_state_entity_type'), ['entity_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_gl_ledger_state_entity_id'), ['entity_id'], unique=False)

    op.create_table(
        'gl_ledger_audit',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('round_id', sa.Integer(), nullable=False),
        sa.Column('entity_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('previous_points', sa.Float(), nullable=False),
        sa.Column('new_points', sa.Float(), nullable=False),
        sa.Column('delta', sa.Float(), nullable=False),
        sa.Column('previous_payload_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('new_payload_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('previous_payload', sa.JSON(), nullable=True),
        sa.Column('new_payload', sa.JSON(), nullable=True),
        sa.Column('provider_timestamp', sa.DateTime(), nullable=True),
        sa.Column('detected_at', sa.DateTime(), nullable=False),
        sa.Column('reason', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('run_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['run_id'], ['ms_data_sync_run.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('gl_ledger_audit', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_gl_ledger_audit_round_id'), ['round_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gl_ledger_audit_entity_type'), ['entity_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_gl_ledger_audit_entity_id'), ['entity_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_gl_ledger_audit_detected_at'), ['detected_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_gl_ledger_audit_run_id'), ['run_id'], unique=False)


def downgrade() -> None:
    op.drop_table('gl_ledger_audit')
    op.drop_table('gl_ledger_state')
