from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.database import engine, get_session
from backend.app.models import Transaction
from backend.app.schemas import HealthRead, TransactionCreate, TransactionRead


router = APIRouter(prefix="/api")
SessionDependency = Annotated[Session, Depends(get_session)]


@router.get("/health", response_model=HealthRead)
def health() -> HealthRead:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return HealthRead(status="ok", database="unavailable")

    return HealthRead(status="ok", database="available")


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(session: SessionDependency) -> list[Transaction]:
    statement = select(Transaction).order_by(
        Transaction.occurred_on.desc(), Transaction.id.desc()
    )
    return list(session.scalars(statement))


@router.post(
    "/transactions",
    response_model=TransactionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    payload: TransactionCreate, session: SessionDependency
) -> Transaction:
    transaction = Transaction(**payload.model_dump())
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction
