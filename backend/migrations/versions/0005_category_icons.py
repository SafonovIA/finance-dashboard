"""Persist category icons independently of category names."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("categories", sa.Column("icon", sa.String(40), nullable=False, server_default="other"))
    defaults = {"Продукты": "basket", "Транспорт": "bus", "Жилье": "home", "Развлечения": "game", "Здоровье": "health", "Зарплата": "work", "Фриланс": "art", "Инвестиции": "growth"}
    for name, icon in defaults.items():
        op.get_bind().execute(sa.text("UPDATE categories SET icon=:icon WHERE name=:name"), {"name": name, "icon": icon})


def downgrade():
    op.drop_column("categories", "icon")
