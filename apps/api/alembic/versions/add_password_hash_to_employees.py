"""add password_hash to employees

Revision ID: d1e2f3a4b5c6
Revises: c0c4dcc27def
Create Date: 2026-01-02 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c0c4dcc27def'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add password_hash column to employees table
    op.add_column('employees', sa.Column('password_hash', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove password_hash column from employees table
    op.drop_column('employees', 'password_hash')

