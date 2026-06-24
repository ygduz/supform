"""add reports table"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if not conn.dialect.has_table(conn, "reports"):
        op.create_table(
            "reports",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("form_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(200), nullable=False, server_default="Untitled Report"),
            sa.Column(
                "widgets",
                postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
                nullable=False,
                server_default="[]",
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["form_id"], ["forms.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_reports_form_id"), "reports", ["form_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_reports_form_id"), table_name="reports")
    op.drop_table("reports")
