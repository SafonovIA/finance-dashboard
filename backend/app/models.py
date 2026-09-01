import enum
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class TransactionType(str, enum.Enum):
    expense = "expense"
    income = "income"


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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
