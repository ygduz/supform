"""add read_at to submissions"""
from alembic import op
import sqlalchemy as sa

revision = "p1q2r3s4t5u6"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("submissions", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    op.drop_column("submissions", "read_at")
