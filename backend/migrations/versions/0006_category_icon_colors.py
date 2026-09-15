"""Persist category icon colors, keeping existing statistics colors."""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("categories", sa.Column("icon_color", sa.String(7), nullable=False, server_default="#78b4f4"))
    op.execute("UPDATE categories SET icon_color = CASE WHEN type = 'income' THEN '#71d28a' ELSE '#e9bd65' END")
    for name, color in {"Продукты": "#f0647d", "Транспорт": "#76a8ef", "Жилье": "#d785ee", "Развлечения": "#ee7f89", "Здоровье": "#efa56f"}.items():
        op.get_bind().execute(sa.text("UPDATE categories SET icon_color=:color WHERE name=:name AND type='expense'"), {"name": name, "color": color})


def downgrade():
    op.drop_column("categories", "icon_color")
