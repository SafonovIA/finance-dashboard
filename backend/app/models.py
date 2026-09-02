import enum
from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


class TransactionType(str, enum.Enum):
    expense = "expense"
    income = "income"


class TransactionKind(str, enum.Enum):
    purchase = "purchase"
    income = "income"
    internal_transfer = "internal_transfer"
    external_transfer = "external_transfer"
    refund = "refund"
    top_up = "top_up"
    error = "error"
    manual = "manual"


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    total_rows: Mapped[int] = mapped_column(default=0)
    imported_rows: Mapped[int] = mapped_column(default=0)
    duplicate_rows: Mapped[int] = mapped_column(default=0)
    excluded_rows: Mapped[int] = mapped_column(default=0)
    error_rows: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="import_batch")


class CategoryRule(Base):
    __tablename__ = "category_rules"
    __table_args__ = (
        UniqueConstraint("merchant_key", "type", name="uq_category_rules_merchant_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_key: Mapped[str] = mapped_column(String(255), index=True)
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type", create_type=False)
    )
    category: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("type", "name", name="uq_categories_type_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type", create_type=False), index=True
    )
    sort_order: Mapped[int] = mapped_column(default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    balance_adjustment_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    category: Mapped[str] = mapped_column(String(100))
    comment: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(100))
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type")
    )
    kind: Mapped[TransactionKind] = mapped_column(
        Enum(TransactionKind, name="transaction_kind"),
        default=TransactionKind.manual,
    )
    included_in_analytics: Mapped[bool] = mapped_column(Boolean, default=True)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mcc: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="Ок")
    fingerprint: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )
    import_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )
    import_batch: Mapped[ImportBatch | None] = relationship(back_populates="transactions")
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), index=True
    )
    account: Mapped[Account] = relationship(back_populates="transactions")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
