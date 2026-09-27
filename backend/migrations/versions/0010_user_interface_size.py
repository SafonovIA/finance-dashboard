"""Store interface size separately for each user."""

from alembic import op
import sqlalchemy as sa


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("interface_size", sa.String(10), nullable=False, server_default="small"))
    op.create_check_constraint("ck_users_interface_size", "users", "interface_size IN ('small', 'medium', 'large')")


def downgrade():
    op.drop_constraint("ck_users_interface_size", "users", type_="check")
    op.drop_column("users", "interface_size")
