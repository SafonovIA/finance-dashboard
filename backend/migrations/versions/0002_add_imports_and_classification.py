"""add imports and transaction classification

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-01
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


transaction_type = postgresql.ENUM(
    "expense", "income", name="transaction_type", create_type=False
)
transaction_kind = postgresql.ENUM(
    "purchase",
    "income",
    "internal_transfer",
    "external_transfer",
    "refund",
    "top_up",
    "error",
    "manual",
    name="transaction_kind",
    create_type=False,
)


def upgrade() -> None:
    transaction_kind.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("imported_rows", sa.Integer(), nullable=False),
        sa.Column("duplicate_rows", sa.Integer(), nullable=False),
        sa.Column("excluded_rows", sa.Integer(), nullable=False),
        sa.Column("error_rows", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "category_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("merchant_key", sa.String(length=255), nullable=False),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "merchant_key", "type", name="uq_category_rules_merchant_type"
        ),
    )
    op.create_index("ix_category_rules_merchant_key", "category_rules", ["merchant_key"])

    op.add_column(
        "transactions",
        sa.Column(
            "kind",
            transaction_kind,
            server_default="manual",
            nullable=False,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "included_in_analytics",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
    )
    op.add_column("transactions", sa.Column("merchant", sa.String(255), nullable=True))
    op.add_column("transactions", sa.Column("bank_category", sa.String(100), nullable=True))
    op.add_column("transactions", sa.Column("mcc", sa.String(10), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("status", sa.String(30), server_default="Ок", nullable=False),
    )
    op.add_column("transactions", sa.Column("fingerprint", sa.String(64), nullable=True))
    op.add_column(
        "transactions",
        sa.Column(
            "import_batch_id",
            sa.Integer(),
            sa.ForeignKey("import_batches.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_transactions_fingerprint", "transactions", ["fingerprint"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_transactions_fingerprint", table_name="transactions")
    op.drop_column("transactions", "updated_at")
    op.drop_column("transactions", "import_batch_id")
    op.drop_column("transactions", "fingerprint")
    op.drop_column("transactions", "status")
    op.drop_column("transactions", "mcc")
    op.drop_column("transactions", "bank_category")
    op.drop_column("transactions", "merchant")
    op.drop_column("transactions", "included_in_analytics")
    op.drop_column("transactions", "kind")
    op.drop_index("ix_category_rules_merchant_key", table_name="category_rules")
    op.drop_table("category_rules")
    op.drop_table("import_batches")
    transaction_kind.drop(op.get_bind(), checkfirst=True)
