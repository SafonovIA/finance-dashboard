"""add editable categories

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-02
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    transaction_type = postgresql.ENUM(
        "expense",
        "income",
        name="transaction_type",
        create_type=False,
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "type",
            transaction_type,
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.false(), nullable=False),
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
        sa.UniqueConstraint("type", "name", name="uq_categories_type_name"),
    )
    op.create_index("ix_categories_type", "categories", ["type"])

    categories = sa.table(
        "categories",
        sa.column("name", sa.String()),
        sa.column("type", transaction_type),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_system", sa.Boolean()),
    )
    op.bulk_insert(
        categories,
        [
            {"name": "Продукты", "type": "expense", "sort_order": 0, "is_system": False},
            {"name": "Транспорт", "type": "expense", "sort_order": 1, "is_system": False},
            {"name": "Жилье", "type": "expense", "sort_order": 2, "is_system": False},
            {"name": "Развлечения", "type": "expense", "sort_order": 3, "is_system": False},
            {"name": "Здоровье", "type": "expense", "sort_order": 4, "is_system": False},
            {"name": "Другое", "type": "expense", "sort_order": 5, "is_system": True},
            {"name": "Зарплата", "type": "income", "sort_order": 0, "is_system": False},
            {"name": "Фриланс", "type": "income", "sort_order": 1, "is_system": False},
            {"name": "Инвестиции", "type": "income", "sort_order": 2, "is_system": False},
            {"name": "Другое", "type": "income", "sort_order": 3, "is_system": True},
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_categories_type", table_name="categories")
    op.drop_table("categories")
