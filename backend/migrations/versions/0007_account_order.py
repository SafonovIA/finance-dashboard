"""Persist account display order."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("accounts", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="1000000"))
    op.execute("WITH ordered AS (SELECT id, row_number() OVER (ORDER BY name, id) AS position FROM accounts) UPDATE accounts SET sort_order=ordered.position FROM ordered WHERE accounts.id=ordered.id")


def downgrade():
    op.drop_column("accounts", "sort_order")
