"""Email registration and revocable sessions for the finance dashboard."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import IntegrityError

from backend.app.database import SessionLocal
from backend.app.models import AuthSession, User, Account, Category, CategoryRule, ImportBatch, Transaction, TransactionType


router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE_NAME = "finance_session"
SESSION_LIFETIME = timedelta(days=14)


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=128)


class Registration(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=128)


class EmailUpdate(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


DEFAULT_CATEGORIES = (
    (TransactionType.expense, "Продукты", "basket", "#f0647d"),
    (TransactionType.expense, "Транспорт", "bus", "#76a8ef"),
    (TransactionType.expense, "Жилье", "home", "#d785ee"),
    (TransactionType.expense, "Развлечения", "game", "#ee7f89"),
    (TransactionType.expense, "Здоровье", "health", "#efa56f"),
    (TransactionType.expense, "Другое", "other", "#e9bd65"),
    (TransactionType.income, "Зарплата", "work", "#71d28a"),
    (TransactionType.income, "Фриланс", "art", "#71d28a"),
    (TransactionType.income, "Инвестиции", "growth", "#71d28a"),
    (TransactionType.income, "Другое", "other", "#71d28a"),
)


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def claim_or_seed_categories(session, user_id: int, first_user: bool) -> None:
    if first_user:
        for model in (Account, Category, CategoryRule, ImportBatch, Transaction):
            session.execute(update(model).where(model.user_id.is_(None)).values(user_id=user_id))
    if session.scalar(select(func.count(Category.id)).where(Category.user_id == user_id)):
        return
    for transaction_type, name, icon, color in DEFAULT_CATEGORIES:
        order = sum(1 for category in session.new if isinstance(category, Category) and category.type == transaction_type)
        session.add(Category(user_id=user_id, type=transaction_type, name=name, icon=icon, icon_color=color, sort_order=order, is_system=name == "Другое"))


@router.post("/register", status_code=201)
def register(payload: Registration, request: Request, response: Response):
    email = normalize_email(payload.email)
    with SessionLocal() as session:
        if session.bind.dialect.name == "postgresql":
            session.execute(text("SELECT pg_advisory_xact_lock(182334291)"))
        first_user = session.scalar(select(func.count(User.id))) == 0
        user = User(username=email, email=email, password_hash=hash_password(payload.password))
        session.add(user)
        try:
            session.flush()
            claim_or_seed_categories(session, user.id, first_user)
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "Этот email уже зарегистрирован") from error
        user_id = user.id
    set_session(response, user_id, request.url.scheme == "https")
    return {"email": email}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${key.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_hex, key_hex = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, bytes.fromhex(key_hex))
    except (ValueError, TypeError):
        return False


def session_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user_id(request: Request) -> int | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    with SessionLocal() as session:
        row = session.scalar(select(AuthSession).where(
            AuthSession.token_hash == session_hash(token),
            AuthSession.expires_at > datetime.now(timezone.utc),
        ))
        return row.user_id if row else None


def set_session(response: Response, user_id: int, secure: bool) -> None:
    token = secrets.token_urlsafe(32)
    with SessionLocal() as session:
        session.add(AuthSession(token_hash=session_hash(token), user_id=user_id, expires_at=datetime.now(timezone.utc) + SESSION_LIFETIME))
        session.commit()
    response.set_cookie(COOKIE_NAME, token, max_age=int(SESSION_LIFETIME.total_seconds()), httponly=True, secure=secure, samesite="strict", path="/")


@router.get("/status")
def status(request: Request):
    with SessionLocal() as session:
        setup_required = session.scalar(select(func.count(User.id))) == 0
    return {"setup_required": setup_required, "authenticated": current_user_id(request) is not None}


@router.post("/setup", status_code=201)
def setup(payload: Credentials, request: Request, response: Response):
    username = payload.username.strip()
    if not username:
        raise HTTPException(422, "Введите имя пользователя")
    with SessionLocal() as session:
        if session.scalar(select(func.count(User.id))):
            raise HTTPException(409, "Владелец уже создан")
        user = User(username=username, password_hash=hash_password(payload.password))
        session.add(user)
        try:
            session.flush()
            claim_or_seed_categories(session, user.id, True)
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "Владелец уже создан") from error
        user_id = user.id
    set_session(response, user_id, request.url.scheme == "https")
    return {"username": username}


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response):
    with SessionLocal() as session:
        identity = payload.username.strip()
        user = session.scalar(select(User).where(or_(User.username == identity, User.email == normalize_email(identity))))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(401, "Неверное имя пользователя или пароль")
        user_id, username = user.id, user.username
    set_session(response, user_id, request.url.scheme == "https")
    return {"username": username}


@router.get("/profile")
def profile(request: Request):
    user_id = current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Требуется вход")
    with SessionLocal() as session:
        user = session.get(User, user_id)
        return {"email": user.email, "username": user.username}


@router.patch("/profile")
def update_profile(payload: EmailUpdate, request: Request):
    user_id = current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Требуется вход")
    with SessionLocal() as session:
        user = session.get(User, user_id)
        new_email = normalize_email(payload.email)
        if session.scalar(select(User.id).where(User.username == new_email, User.id != user_id)):
            raise HTTPException(409, "Этот email уже зарегистрирован")
        user.email = new_email
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "Этот email уже зарегистрирован") from error
        return {"email": user.email, "username": user.username}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with SessionLocal() as session:
            row = session.scalar(select(AuthSession).where(AuthSession.token_hash == session_hash(token)))
            if row:
                session.delete(row)
                session.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
