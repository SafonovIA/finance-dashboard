from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.app.models import TransactionKind, TransactionType


class TransactionCreate(BaseModel):
    occurred_on: date
    amount_cents: int = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    comment: str | None = Field(default=None, max_length=255)
    source: str = Field(min_length=1, max_length=100)
    account_id: int | None = Field(default=None, gt=0)
    type: TransactionType


class TransactionRead(TransactionCreate):
    id: int
    kind: TransactionKind
    included_in_analytics: bool
    merchant: str | None
    bank_category: str | None
    mcc: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TransactionUpdate(BaseModel):
    occurred_on: date | None = None
    amount_cents: int | None = Field(default=None, gt=0)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    comment: str | None = Field(default=None, max_length=255)
    source: str | None = Field(default=None, min_length=1, max_length=100)
    account_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def require_change(self) -> "TransactionUpdate":
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно поле для изменения")
        return self


class CategoryTotal(BaseModel):
    category: str
    amount_cents: int


class StatisticsRead(BaseModel):
    month: str
    expenses: list[CategoryTotal]
    incomes: list[CategoryTotal]
    expense_total_cents: int
    income_total_cents: int
    balance_cents: int


class MonthRead(BaseModel):
    value: str
    label: str


class ImportRead(BaseModel):
    id: int
    filename: str
    total_rows: int
    imported_rows: int
    duplicate_rows: int
    excluded_rows: int
    error_rows: int
    month: str | None


class CategoriesRead(BaseModel):
    expense: list[str]
    income: list[str]


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    balance_cents: int = 0


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    balance_cents: int | None = None

    @model_validator(mode="after")
    def require_change(self) -> "AccountUpdate":
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно поле для изменения")
        return self


class AccountRead(BaseModel):
    id: int
    name: str
    balance_cents: int
    transaction_count: int
    created_at: datetime
    updated_at: datetime


class HealthRead(BaseModel):
    status: str
    database: str
