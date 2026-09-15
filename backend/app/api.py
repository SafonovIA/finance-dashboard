from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import case, delete, func, select, text, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.database import engine, get_session
from backend.app.importer import (
    ImportFormatError,
    merchant_key,
    parse_transaction,
    read_excel_rows,
)
from backend.app.models import (
    Account,
    Category,
    CategoryRule,
    ImportBatch,
    Transaction,
    TransactionKind,
    TransactionType,
)
from backend.app.schemas import (
    AccountCreate,
    AccountRead,
    AccountUpdate,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    CategoriesRead,
    CategoryTotal,
    HealthRead,
    ImportRead,
    MonthDeleteRead,
    MonthRead,
    StatisticsRead,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)


router = APIRouter(prefix="/api")
SessionDependency = Annotated[Session, Depends(get_session)]
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MONTH_NAMES = (
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
)


def month_bounds(month: str) -> tuple[date, date]:
    try:
        year_text, month_text = month.split("-", maxsplit=1)
        year, month_number = int(year_text), int(month_text)
        start = date(year, month_number, 1)
    except (TypeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Месяц должен быть указан в формате YYYY-MM",
        ) from error
    end = date(year, month_number, monthrange(year, month_number)[1])
    return start, end


def normalized_name(name: str) -> str:
    return " ".join(name.split())


def find_category(
    session: Session,
    transaction_type: TransactionType,
    name: str,
) -> Category | None:
    return session.scalar(
        select(Category).where(
            Category.type == transaction_type,
            func.lower(Category.name) == name.casefold(),
        )
    )


def validate_category(
    session: Session,
    transaction_type: TransactionType,
    category: str,
) -> None:
    if find_category(session, transaction_type, category) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Недопустимая категория для типа {transaction_type.value}",
        )


def normalized_account_name(name: str) -> str:
    return normalized_name(name)


def get_account(session: Session, account_id: int) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Счёт не найден")
    return account


def find_account_by_name(session: Session, name: str) -> Account | None:
    return session.scalar(
        select(Account).where(func.lower(Account.name) == name.casefold())
    )


def account_movement_expression():
    return case(
        (Transaction.status != "Ок", 0),
        (Transaction.kind == TransactionKind.refund, Transaction.amount_cents),
        (Transaction.type == TransactionType.income, Transaction.amount_cents),
        else_=-Transaction.amount_cents,
    )


def account_movement(session: Session, account_id: int) -> int:
    return int(
        session.scalar(
            select(func.coalesce(func.sum(account_movement_expression()), 0)).where(
                Transaction.account_id == account_id
            )
        )
        or 0
    )


@router.get("/health", response_model=HealthRead)
def health() -> HealthRead:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return HealthRead(status="ok", database="unavailable")

    return HealthRead(status="ok", database="available")


@router.get("/categories", response_model=CategoriesRead)
def categories(session: SessionDependency) -> CategoriesRead:
    rows = list(
        session.scalars(
            select(Category).order_by(Category.type, Category.sort_order, Category.id)
        )
    )
    return CategoriesRead(
        expense=[row for row in rows if row.type == TransactionType.expense],
        income=[row for row in rows if row.type == TransactionType.income],
    )


@router.post(
    "/categories",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: CategoryCreate,
    session: SessionDependency,
) -> Category:
    name = normalized_name(payload.name)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Введите название категории",
        )
    if find_category(session, payload.type, name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Категория с таким названием уже существует",
        )
    next_order = int(
        session.scalar(
            select(func.coalesce(func.max(Category.sort_order), -1)).where(
                Category.type == payload.type
            )
        )
        or 0
    ) + 1
    category = Category(
        name=name,
        icon=payload.icon,
        icon_color=payload.icon_color,
        type=payload.type,
        sort_order=next_order,
        is_system=False,
    )
    session.add(category)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Категория с таким названием уже существует",
        ) from error
    session.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    session: SessionDependency,
) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")
    if category.is_system and normalized_name(payload.name) != category.name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Системную категорию «Другое» нельзя изменить",
        )

    name = normalized_name(payload.name)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Введите название категории",
        )
    duplicate = find_category(session, category.type, name)
    if duplicate and duplicate.id != category.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Категория с таким названием уже существует",
        )

    old_name = category.name
    category.name = name
    if payload.icon is not None:
        category.icon = payload.icon
    if payload.icon_color is not None:
        category.icon_color = payload.icon_color
    session.execute(
        update(Transaction)
        .where(Transaction.type == category.type, Transaction.category == old_name)
        .values(category=name)
    )
    session.execute(
        update(CategoryRule)
        .where(CategoryRule.type == category.type, CategoryRule.category == old_name)
        .values(category=name)
    )
    session.commit()
    session.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, session: SessionDependency) -> None:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")
    if category.is_system:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Системную категорию «Другое» нельзя удалить",
        )

    fallback = session.scalar(
        select(Category).where(
            Category.type == category.type,
            Category.is_system.is_(True),
        )
    )
    if fallback is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Не найдена системная категория «Другое»",
        )
    session.execute(
        update(Transaction)
        .where(Transaction.type == category.type, Transaction.category == category.name)
        .values(category=fallback.name)
    )
    session.execute(
        update(CategoryRule)
        .where(CategoryRule.type == category.type, CategoryRule.category == category.name)
        .values(category=fallback.name)
    )
    session.delete(category)
    session.commit()


@router.post("/categories/{category_id}/move", status_code=status.HTTP_204_NO_CONTENT)
def move_category(category_id: int, session: SessionDependency, direction: str = Query(pattern="^(up|down)$")) -> None:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    rows = list(session.scalars(select(Category).where(Category.type == category.type).order_by(Category.sort_order, Category.id).with_for_update()))
    move_row(rows, category_id, direction)
    session.commit()


@router.post("/accounts/{account_id}/move", status_code=status.HTTP_204_NO_CONTENT)
def move_account(account_id: int, session: SessionDependency, direction: str = Query(pattern="^(up|down)$")) -> None:
    get_account(session, account_id)
    rows = list(session.scalars(select(Account).order_by(Account.sort_order, Account.name, Account.id).with_for_update()))
    move_row(rows, account_id, direction)
    session.commit()


@router.post("/categories/{category_id}/place", status_code=status.HTTP_204_NO_CONTENT)
def place_category(category_id: int, target_id: int, session: SessionDependency) -> None:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    rows = list(session.scalars(select(Category).where(Category.type == category.type).order_by(Category.sort_order, Category.id).with_for_update()))
    place_row(rows, category_id, target_id)
    session.commit()


@router.post("/accounts/{account_id}/place", status_code=status.HTTP_204_NO_CONTENT)
def place_account(account_id: int, target_id: int, session: SessionDependency) -> None:
    rows = list(session.scalars(select(Account).order_by(Account.sort_order, Account.name, Account.id).with_for_update()))
    place_row(rows, account_id, target_id)
    session.commit()


def place_row(rows, row_id: int, target_id: int) -> None:
    ids = [row.id for row in rows]
    if row_id not in ids or target_id not in ids:
        raise HTTPException(status_code=422, detail="Строки должны быть в одной панели")
    source, target = ids.index(row_id), ids.index(target_id)
    rows.insert(target, rows.pop(source))
    for position, row in enumerate(rows):
        row.sort_order = position


def move_row(rows, row_id: int, direction: str) -> None:
    index = next(index for index, row in enumerate(rows) if row.id == row_id)
    target = index + (-1 if direction == "up" else 1)
    if 0 <= target < len(rows):
        rows[index], rows[target] = rows[target], rows[index]
    for position, row in enumerate(rows):
        row.sort_order = position


@router.get("/accounts", response_model=list[AccountRead])
def list_accounts(session: SessionDependency) -> list[AccountRead]:
    movement = account_movement_expression()
    rows = session.execute(
        select(
            Account,
            func.coalesce(func.sum(movement), 0),
            func.count(Transaction.id),
        )
        .outerjoin(Transaction, Transaction.account_id == Account.id)
        .group_by(Account.id)
        .order_by(Account.sort_order, Account.name, Account.id)
    )
    return [
        AccountRead(
            id=account.id,
            name=account.name,
            balance_cents=account.balance_adjustment_cents + int(net_movement),
            transaction_count=int(transaction_count),
            created_at=account.created_at,
            updated_at=account.updated_at,
        )
        for account, net_movement, transaction_count in rows
    ]


@router.post(
    "/accounts",
    response_model=AccountRead,
    status_code=status.HTTP_201_CREATED,
)
def create_account(payload: AccountCreate, session: SessionDependency) -> AccountRead:
    name = normalized_account_name(payload.name)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Введите название счёта",
        )
    if find_account_by_name(session, name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Счёт с таким названием уже существует",
        )

    account = Account(name=name, balance_adjustment_cents=payload.balance_cents)
    session.add(account)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Счёт с таким названием уже существует",
        ) from error
    session.refresh(account)
    return AccountRead(
        id=account.id,
        name=account.name,
        balance_cents=payload.balance_cents,
        transaction_count=0,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


@router.patch("/accounts/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    session: SessionDependency,
) -> AccountRead:
    account = get_account(session, account_id)
    changes = payload.model_dump(exclude_unset=True)
    movement = account_movement(session, account.id)

    if "name" in changes:
        name = normalized_account_name(changes["name"])
        duplicate = find_account_by_name(session, name)
        if duplicate and duplicate.id != account.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Счёт с таким названием уже существует",
            )
        account.name = name
        session.execute(
            update(Transaction)
            .where(Transaction.account_id == account.id)
            .values(source=name)
        )

    if "balance_cents" in changes:
        account.balance_adjustment_cents = changes["balance_cents"] - movement

    session.commit()
    session.refresh(account)
    transaction_count = int(
        session.scalar(
            select(func.count(Transaction.id)).where(Transaction.account_id == account.id)
        )
        or 0
    )
    return AccountRead(
        id=account.id,
        name=account.name,
        balance_cents=account.balance_adjustment_cents + movement,
        transaction_count=transaction_count,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, session: SessionDependency) -> None:
    account = get_account(session, account_id)
    transaction_count = int(
        session.scalar(
            select(func.count(Transaction.id)).where(Transaction.account_id == account.id)
        )
        or 0
    )
    if transaction_count:
        if account.name.casefold() == "Без счёта".casefold():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Счёт «Без счёта» используется операциями и не может быть удалён",
            )
        fallback = find_account_by_name(session, "Без счёта")
        if fallback is None:
            fallback = Account(name="Без счёта", balance_adjustment_cents=0)
            session.add(fallback)
            session.flush()
        session.execute(
            update(Transaction)
            .where(Transaction.account_id == account.id)
            .values(account_id=fallback.id, source=fallback.name)
        )
    session.delete(account)
    session.commit()


@router.get("/months", response_model=list[MonthRead])
def list_months(session: SessionDependency) -> list[MonthRead]:
    dates = session.scalars(
        select(Transaction.occurred_on)
        .where(Transaction.included_in_analytics.is_(True))
        .order_by(Transaction.occurred_on.desc())
    )
    values = sorted({value.strftime("%Y-%m") for value in dates}, reverse=True)
    return [
        MonthRead(
            value=value,
            label=f"{MONTH_NAMES[int(value[5:7]) - 1]} {value[:4]}",
        )
        for value in values
    ]


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(
    session: SessionDependency,
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    include_excluded: bool = False,
) -> list[Transaction]:
    statement = select(Transaction)
    if month:
        start, end = month_bounds(month)
        statement = statement.where(Transaction.occurred_on.between(start, end))
    if not include_excluded:
        statement = statement.where(Transaction.included_in_analytics.is_(True))
    statement = statement.order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
    return list(session.scalars(statement))


@router.delete("/transactions", response_model=MonthDeleteRead)
def delete_month_transactions(
    session: SessionDependency,
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
) -> MonthDeleteRead:
    start, end = month_bounds(month)
    result = session.execute(
        delete(Transaction).where(Transaction.occurred_on.between(start, end))
    )
    session.commit()
    return MonthDeleteRead(month=month, deleted_rows=result.rowcount or 0)


@router.post(
    "/transactions",
    response_model=TransactionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    payload: TransactionCreate, session: SessionDependency
) -> Transaction:
    validate_category(session, payload.type, payload.category)
    data = payload.model_dump()
    account_id = data.pop("account_id")
    source = normalized_account_name(data.pop("source"))
    account = get_account(session, account_id) if account_id else find_account_by_name(session, source)
    if account is None:
        account = Account(name=source, balance_adjustment_cents=0)
        session.add(account)
        session.flush()
    transaction = Transaction(
        **data,
        account_id=account.id,
        source=account.name,
        kind=TransactionKind.manual,
        included_in_analytics=True,
        status="Ок",
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction


@router.patch("/transactions/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    session: SessionDependency,
) -> Transaction:
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Операция не найдена")

    changes = payload.model_dump(exclude_unset=True)
    if "category" in changes:
        validate_category(session, transaction.type, changes["category"])
    requested_account_id = changes.pop("account_id", None)
    requested_source = changes.pop("source", None)
    if "account_id" in payload.model_fields_set:
        if requested_account_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Выберите счёт",
            )
        account = get_account(session, requested_account_id)
        transaction.account_id = account.id
        transaction.source = account.name
    elif requested_source is not None:
        source_name = normalized_account_name(requested_source)
        account = find_account_by_name(session, source_name)
        if account is None:
            account = Account(name=source_name, balance_adjustment_cents=0)
            session.add(account)
            session.flush()
        transaction.account_id = account.id
        transaction.source = account.name

    category_changed = "category" in changes and changes["category"] != transaction.category
    for field, value in changes.items():
        setattr(transaction, field, value)

    if category_changed and transaction.merchant and merchant_key(transaction.merchant):
        key = merchant_key(transaction.merchant)
        rule = session.scalar(
            select(CategoryRule).where(
                CategoryRule.merchant_key == key,
                CategoryRule.type == transaction.type,
            )
        )
        if rule is None:
            session.add(
                CategoryRule(
                    merchant_key=key,
                    type=transaction.type,
                    category=transaction.category,
                )
            )
        else:
            rule.category = transaction.category

    session.commit()
    session.refresh(transaction)
    return transaction


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, session: SessionDependency) -> None:
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Операция не найдена")
    session.delete(transaction)
    session.commit()


@router.get("/statistics", response_model=StatisticsRead)
def statistics(
    session: SessionDependency,
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
) -> StatisticsRead:
    start, end = month_bounds(month)
    transactions = session.scalars(
        select(Transaction).where(
            Transaction.occurred_on.between(start, end),
            Transaction.included_in_analytics.is_(True),
        )
    )

    categories_by_type = {
        TransactionType.expense: [],
        TransactionType.income: [],
    }
    for category in session.scalars(
        select(Category).order_by(Category.type, Category.sort_order, Category.id)
    ):
        categories_by_type[category.type].append(category.name)

    expense_totals = {
        category: 0 for category in categories_by_type[TransactionType.expense]
    }
    income_totals = {
        category: 0 for category in categories_by_type[TransactionType.income]
    }
    for transaction in transactions:
        if transaction.type == TransactionType.expense:
            multiplier = -1 if transaction.kind == TransactionKind.refund else 1
            expense_totals[transaction.category] = expense_totals.get(transaction.category, 0) + multiplier * transaction.amount_cents
        else:
            income_totals[transaction.category] = income_totals.get(transaction.category, 0) + transaction.amount_cents

    expenses = [
        CategoryTotal(category=category, amount_cents=max(0, amount))
        for category, amount in expense_totals.items()
    ]
    incomes = [CategoryTotal(category=category, amount_cents=amount) for category, amount in income_totals.items()]
    expense_total = sum(item.amount_cents for item in expenses)
    income_total = sum(item.amount_cents for item in incomes)
    return StatisticsRead(
        month=month,
        expenses=expenses,
        incomes=incomes,
        expense_total_cents=expense_total,
        income_total_cents=income_total,
        balance_cents=income_total - expense_total,
    )


@router.post(
    "/imports/excel",
    response_model=ImportRead,
    status_code=status.HTTP_201_CREATED,
)
async def import_excel(
    session: SessionDependency,
    file: UploadFile = File(...),
) -> ImportRead:
    filename = file.filename or "operations.xlsx"
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл слишком большой. Максимальный размер — 15 МБ",
        )

    try:
        records = read_excel_rows(filename, content)
    except ImportFormatError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Не удалось прочитать Excel-файл",
        ) from error

    rules = {
        (rule.merchant_key, rule.type): rule.category
        for rule in session.scalars(select(CategoryRule))
    }
    parsed = []
    parsing_errors = 0
    for record in records:
        try:
            parsed.append(parse_transaction(record, rules))
        except ImportFormatError:
            parsing_errors += 1

    fingerprints = [transaction.fingerprint for transaction in parsed]
    existing = (
        set(
            session.scalars(
                select(Transaction.fingerprint).where(Transaction.fingerprint.in_(fingerprints))
            )
        )
        if fingerprints
        else set()
    )
    seen: set[str] = set()
    unique_transactions = []
    duplicate_rows = 0
    for transaction in parsed:
        if transaction.fingerprint in existing or transaction.fingerprint in seen:
            duplicate_rows += 1
            continue
        seen.add(transaction.fingerprint)
        unique_transactions.append(transaction)

    batch = ImportBatch(
        filename=filename[:255],
        total_rows=len(records),
        imported_rows=len(unique_transactions),
        duplicate_rows=duplicate_rows,
        excluded_rows=sum(not transaction.included_in_analytics for transaction in unique_transactions),
        error_rows=parsing_errors
        + sum(transaction.kind == TransactionKind.error for transaction in unique_transactions),
    )
    session.add(batch)
    session.flush()
    available_categories = {
        (category.type, category.name)
        for category in session.scalars(select(Category))
    }
    fallback_categories = {
        category.type: category.name
        for category in session.scalars(select(Category).where(Category.is_system.is_(True)))
    }
    account_names = sorted({transaction.source for transaction in unique_transactions})
    accounts_by_name = {
        account.name: account
        for account in session.scalars(select(Account).where(Account.name.in_(account_names)))
    }
    for account_name in account_names:
        if account_name not in accounts_by_name:
            account = Account(name=account_name, balance_adjustment_cents=0)
            session.add(account)
            session.flush()
            accounts_by_name[account_name] = account
    for transaction in unique_transactions:
        account = accounts_by_name[transaction.source]
        transaction_data = transaction.__dict__.copy()
        transaction_data["source"] = account.name
        if (transaction.type, transaction.category) not in available_categories:
            transaction_data["category"] = fallback_categories[transaction.type]
        session.add(
            Transaction(
                **transaction_data,
                import_batch_id=batch.id,
                account_id=account.id,
            )
        )
    session.commit()
    session.refresh(batch)

    imported_dates = [transaction.occurred_on for transaction in parsed]
    latest_month = max(imported_dates).strftime("%Y-%m") if imported_dates else None
    return ImportRead(
        id=batch.id,
        filename=batch.filename,
        total_rows=batch.total_rows,
        imported_rows=batch.imported_rows,
        duplicate_rows=batch.duplicate_rows,
        excluded_rows=batch.excluded_rows,
        error_rows=batch.error_rows,
        month=latest_month,
    )
