"""add workflow_step to submissions"""
from alembic import op
import sqlalchemy as sa

revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute(
        "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS workflow_step VARCHAR(100)"
    )

def downgrade() -> None:
    op.drop_column("submissions", "workflow_step")
