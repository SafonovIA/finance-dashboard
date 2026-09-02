"""add accounts and link transactions

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-02
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "balance_adjustment_cents",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
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
        sa.UniqueConstraint("name", name="uq_accounts_name"),
    )
    op.create_index("ix_accounts_name", "accounts", ["name"])
    op.add_column("transactions", sa.Column("account_id", sa.Integer(), nullable=True))

    op.execute(
        """
        INSERT INTO accounts (name, balance_adjustment_cents)
        SELECT DISTINCT
            COALESCE(NULLIF(BTRIM(regexp_replace(source, '\\s+\\*[0-9]{4}$', '')), ''), 'Не указан'),
            0
        FROM transactions
        ON CONFLICT (name) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE transactions AS transaction
        SET account_id = account.id,
            source = account.name
        FROM accounts AS account
        WHERE account.name = COALESCE(
            NULLIF(BTRIM(regexp_replace(transaction.source, '\\s+\\*[0-9]{4}$', '')), ''),
            'Не указан'
        )
        """
    )

    op.alter_column("transactions", "account_id", nullable=False)
    op.create_foreign_key(
        "fk_transactions_account_id_accounts",
        "transactions",
        "accounts",
        ["account_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_account_id", table_name="transactions")
    op.drop_constraint(
        "fk_transactions_account_id_accounts",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transactions", "account_id")
    op.drop_index("ix_accounts_name", table_name="accounts")
    op.drop_table("accounts")
