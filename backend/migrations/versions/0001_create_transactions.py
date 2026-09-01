"""create transactions table

Revision ID: 0001
Revises:
Create Date: 2026-09-01
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


transaction_type = postgresql.ENUM(
    "expense", "income", name="transaction_type", create_type=False
)


def upgrade() -> None:
    postgresql.ENUM(
        "expense", "income", name="transaction_type"
    ).create(op.get_bind(), checkfirst=True)
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("comment", sa.String(length=255), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_transactions_occurred_on", "transactions", ["occurred_on"])


def downgrade() -> None:
    op.drop_index("ix_transactions_occurred_on", table_name="transactions")
    op.drop_table("transactions")
    transaction_type.drop(op.get_bind(), checkfirst=True)
