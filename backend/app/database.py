from collections.abc import Generator

from fastapi import HTTPException, Request
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker, with_loader_criteria

from backend.app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session(request: Request) -> Generator[Session, None, None]:
    user_id = getattr(request.state, "user_id", None)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Требуется вход")
    with SessionLocal() as session:
        session.info["tenant_id"] = user_id
        yield session


def tenant_models():
    from backend.app.models import Account, Category, CategoryRule, ImportBatch, Transaction
    return (Account, Category, CategoryRule, ImportBatch, Transaction)


@event.listens_for(Session, "do_orm_execute")
def scope_finance_queries(state):
    user_id = state.session.info.get("tenant_id")
    if user_id is None:
        return
    if state.is_select or state.is_update or state.is_delete:
        statement = state.statement
        for model in tenant_models():
            statement = statement.options(with_loader_criteria(model, lambda cls: cls.user_id == user_id, include_aliases=True))
        state.statement = statement


@event.listens_for(Session, "before_flush")
def scope_finance_writes(session, _flush_context, _instances):
    user_id = session.info.get("tenant_id")
    if user_id is None:
        return
    models = tenant_models()
    for row in session.new:
        if isinstance(row, models):
            if row.user_id is not None and row.user_id != user_id:
                raise ValueError("Нельзя создать запись для другого пользователя")
            row.user_id = user_id
    for row in session.dirty | session.deleted:
        if isinstance(row, models) and row.user_id != user_id:
            raise ValueError("Нельзя изменить запись другого пользователя")
