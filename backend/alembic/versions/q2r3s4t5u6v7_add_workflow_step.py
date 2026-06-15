"""add workflow_step to submissions"""
from alembic import op
import sqlalchemy as sa

revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("submissions", sa.Column("workflow_step", sa.String(100), nullable=True))

def downgrade() -> None:
    op.drop_column("submissions", "workflow_step")
