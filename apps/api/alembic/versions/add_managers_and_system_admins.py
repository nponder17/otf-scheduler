"""add managers and system_admins tables

Revision ID: add_managers_admins
Revises: d1e2f3a4b5c6
Create Date: 2026-01-02 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'add_managers_admins'
down_revision: Union[str, Sequence[str], None] = 'add_password_hash'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create managers table
    op.create_table(
        'managers',
        sa.Column('manager_id', UUID(as_uuid=True), nullable=False),
        sa.Column('company_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.company_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('manager_id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_managers_company_id'), 'managers', ['company_id'], unique=False)
    op.create_index(op.f('ix_managers_email'), 'managers', ['email'], unique=True)

    # Create system_admins table
    op.create_table(
        'system_admins',
        sa.Column('admin_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('admin_id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_system_admins_email'), 'system_admins', ['email'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_system_admins_email'), table_name='system_admins')
    op.drop_table('system_admins')
    op.drop_index(op.f('ix_managers_email'), table_name='managers')
    op.drop_index(op.f('ix_managers_company_id'), table_name='managers')
    op.drop_table('managers')

