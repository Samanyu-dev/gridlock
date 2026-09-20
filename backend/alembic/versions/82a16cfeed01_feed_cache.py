"""Durable real-data cache for serverless cold starts."""
from alembic import op
import sqlalchemy as sa
revision = '82a16cfeed01'
down_revision = '79b9f274292e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('gl_feed_cache', sa.Column('key', sa.String(), primary_key=True),
                    sa.Column('payload', sa.JSON(), nullable=False),
                    sa.Column('updated_at', sa.DateTime(), nullable=False))


def downgrade():
    op.drop_table('gl_feed_cache')
