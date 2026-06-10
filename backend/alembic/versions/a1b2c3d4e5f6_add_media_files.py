"""add media_files

Revision ID: a1b2c3d4e5f6
Revises: 89763ff8663f
Create Date: 2026-06-09 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '89763ff8663f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('media_files',
    sa.Column('form_id', sa.Uuid(), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('content_type', sa.String(length=120), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('respondent_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['form_id'], ['forms.id'], ),
    sa.ForeignKeyConstraint(['respondent_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_media_files_form_id'), 'media_files', ['form_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_media_files_form_id'), table_name='media_files')
    op.drop_table('media_files')
