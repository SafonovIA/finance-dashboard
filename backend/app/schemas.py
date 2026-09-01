from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models import TransactionType


class TransactionCreate(BaseModel):
    occurred_on: date
    amount_cents: int = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    comment: str | None = Field(default=None, max_length=255)
    source: str = Field(min_length=1, max_length=100)
    type: TransactionType


class TransactionRead(TransactionCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HealthRead(BaseModel):
    status: str
    database: str
