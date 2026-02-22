"""add published_at to schedule_runs

Revision ID: add_published_at
Revises: add_managers_admins
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_published_at"
down_revision: Union[str, Sequence[str], None] = "add_managers_admins"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "schedule_runs",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("schedule_runs", "published_at")
