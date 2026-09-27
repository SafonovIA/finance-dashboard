"""Assign existing finance data to the owner and scope new data by user."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

TABLES = ("accounts", "categories", "category_rules", "import_batches", "transactions")


def upgrade():
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    for table in TABLES:
        op.add_column(table, sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])

    owner_id = op.get_bind().scalar(sa.text("SELECT id FROM users ORDER BY id LIMIT 1"))
    if owner_id is not None:
        for table in TABLES:
            op.get_bind().execute(sa.text(f"UPDATE {table} SET user_id = :owner_id WHERE user_id IS NULL"), {"owner_id": owner_id})

    op.drop_constraint("uq_accounts_name", "accounts", type_="unique")
    op.create_unique_constraint("uq_accounts_user_name", "accounts", ["user_id", "name"])
    op.drop_constraint("uq_categories_type_name", "categories", type_="unique")
    op.create_unique_constraint("uq_categories_user_type_name", "categories", ["user_id", "type", "name"])
    op.drop_constraint("uq_category_rules_merchant_type", "category_rules", type_="unique")
    op.create_unique_constraint("uq_category_rules_user_merchant_type", "category_rules", ["user_id", "merchant_key", "type"])
    op.drop_index("ix_transactions_fingerprint", table_name="transactions")
    op.create_index("ix_transactions_fingerprint", "transactions", ["fingerprint"])
    op.create_unique_constraint("uq_transactions_user_fingerprint", "transactions", ["user_id", "fingerprint"])
    op.drop_constraint("users_owner_key_key", "users", type_="unique")
    op.drop_column("users", "owner_key")


def downgrade():
    op.add_column("users", sa.Column("owner_key", sa.String(10), nullable=True))
    op.execute("UPDATE users SET owner_key='owner' WHERE id=(SELECT min(id) FROM users)")
    op.create_unique_constraint("users_owner_key_key", "users", ["owner_key"])
    op.drop_constraint("uq_transactions_user_fingerprint", "transactions", type_="unique")
    op.drop_index("ix_transactions_fingerprint", table_name="transactions")
    op.create_index("ix_transactions_fingerprint", "transactions", ["fingerprint"], unique=True)
    op.drop_constraint("uq_category_rules_user_merchant_type", "category_rules", type_="unique")
    op.create_unique_constraint("uq_category_rules_merchant_type", "category_rules", ["merchant_key", "type"])
    op.drop_constraint("uq_categories_user_type_name", "categories", type_="unique")
    op.create_unique_constraint("uq_categories_type_name", "categories", ["type", "name"])
    op.drop_constraint("uq_accounts_user_name", "accounts", type_="unique")
    op.create_unique_constraint("uq_accounts_name", "accounts", ["name"])
    for table in reversed(TABLES):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_column(table, "user_id")
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_column("users", "email")
