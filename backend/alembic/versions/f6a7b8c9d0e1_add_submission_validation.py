"""add submission validation status

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-10 06:30:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20)"
    )
    op.execute(
        "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS validated_by UUID"
    )
    op.execute(
        "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ"
    )
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_indexes = [idx["name"] for idx in insp.get_indexes("submissions")]
    if "ix_submissions_validation_status" not in existing_indexes:
        op.create_index(
            op.f("ix_submissions_validation_status"),
            "submissions",
            ["validation_status"],
            unique=False,
        )
    existing_fks = [fk["name"] for fk in insp.get_foreign_keys("submissions")]
    if "fk_submissions_validated_by" not in existing_fks:
        op.create_foreign_key(
            "fk_submissions_validated_by", "submissions", "users", ["validated_by"], ["id"]
        )


def downgrade() -> None:
    op.drop_constraint("fk_submissions_validated_by", "submissions", type_="foreignkey")
    op.drop_index(op.f("ix_submissions_validation_status"), table_name="submissions")
    op.drop_column("submissions", "validated_at")
    op.drop_column("submissions", "validated_by")
    op.drop_column("submissions", "validation_status")
