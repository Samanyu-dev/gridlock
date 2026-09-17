"""drop orphaned gl_profile.token_version column

Revision ID: 0dda01c45c70
Revises: dddaa4f5b91b
Create Date: 2026-09-17 06:42:51.608617
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision: str = '0dda01c45c70'
down_revision: Union[str, None] = 'dddaa4f5b91b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `token_version` predates the current auth design and is unreferenced by
    # any code path; being NOT NULL with no default, it breaks every insert
    # on databases that still carry it from an earlier schema iteration. Not
    # every database has it (a fresh install created straight from the
    # initial migration never gets the column), so guard on its presence.
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('gl_profile')}
    if 'token_version' in cols:
        with op.batch_alter_table('gl_profile') as batch_op:
            batch_op.drop_column('token_version')


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('gl_profile')}
    if 'token_version' not in cols:
        with op.batch_alter_table('gl_profile') as batch_op:
            batch_op.add_column(sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'))
