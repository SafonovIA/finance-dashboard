"""Email registration and revocable sessions for the finance dashboard."""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import smtplib
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError

from backend.app.database import SessionLocal
from backend.app.config import get_settings
from backend.app.mailer import require_mail_config, send_auth_email, send_mail
from backend.app.models import AuthSession, EmailToken, User, Account, Category, CategoryRule, ImportBatch, Transaction, TransactionType


router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE_NAME = "finance_session"
SESSION_LIFETIME = timedelta(days=14)
VERIFICATION_LIFETIME = timedelta(hours=24)
RESET_LIFETIME = timedelta(minutes=30)
EMAIL_COOLDOWN = timedelta(minutes=2)


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=128)


class Registration(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=12, max_length=128)


class EmailUpdate(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    current_password: str


class EmailAddress(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmailLinkToken(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=128)


class PasswordReset(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=12, max_length=128)


class InterfaceSettingsUpdate(BaseModel):
    interface_size: Literal["small", "medium", "large"]


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


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def create_email_token(session, user_id: int, email: str, purpose: str) -> str | None:
    previous = session.scalar(select(EmailToken).where(
        EmailToken.user_id == user_id, EmailToken.purpose == purpose,
    ).order_by(EmailToken.created_at.desc(), EmailToken.id.desc()).limit(1))
    if previous and datetime.now(timezone.utc) - utc(previous.created_at) < EMAIL_COOLDOWN:
        return None
    token = secrets.token_urlsafe(32)
    session.add(EmailToken(
        token_hash=session_hash(token), user_id=user_id, email=email, purpose=purpose,
        expires_at=datetime.now(timezone.utc) + (RESET_LIFETIME if purpose == "reset_password" else VERIFICATION_LIFETIME),
    ))
    session.flush()
    return token


def email_link(token: str, purpose: str) -> str:
    path = "reset-password" if purpose == "reset_password" else "verify-email"
    return f"{get_settings().public_base_url.rstrip('/')}/{path}?token={token}"


def send_link(recipient: str, token: str, purpose: str) -> None:
    subject = "Восстановление пароля" if purpose == "reset_password" else "Подтверждение email"
    send_auth_email(recipient, subject, email_link(token, purpose))


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
    require_mail_config()
    email = normalize_email(payload.email)
    with SessionLocal() as session:
        if session.bind.dialect.name == "postgresql":
            session.execute(text("SELECT pg_advisory_xact_lock(182334291)"))
        first_user = session.scalar(select(func.count(User.id))) == 0
        user = User(username=email, email=email, password_hash=hash_password(payload.password), email_verification_required=True)
        session.add(user)
        try:
            session.flush()
            claim_or_seed_categories(session, user.id, first_user)
            token = create_email_token(session, user.id, email, "verify_email")
            send_link(email, token, "verify_email")
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "Этот email уже зарегистрирован") from error
        except (OSError, RuntimeError, smtplib.SMTPException) as error:
            session.rollback()
            raise HTTPException(503, "Не удалось отправить письмо. Попробуйте позже") from error
    return {"email": email, "verification_required": True}


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
    set_session(response, user_id, get_settings().app_env == "production" or request.url.scheme == "https")
    return {"username": username}


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response):
    with SessionLocal() as session:
        identity = payload.username.strip()
        user = session.scalar(select(User).where(or_(User.username == identity, User.email == normalize_email(identity))))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(401, "Неверное имя пользователя или пароль")
        if user.email_verification_required:
            raise HTTPException(403, "Подтвердите email перед входом")
        user_id, username = user.id, user.username
    set_session(response, user_id, get_settings().app_env == "production" or request.url.scheme == "https")
    return {"username": username}


@router.get("/profile")
def profile(request: Request):
    user_id = current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Требуется вход")
    with SessionLocal() as session:
        user = session.get(User, user_id)
        return {"email": user.email, "username": user.username, "interface_size": user.interface_size, "email_verified": user.email_verified_at is not None}


@router.patch("/profile")
def update_profile(payload: EmailUpdate, request: Request):
    user_id = current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Требуется вход")
    require_mail_config()
    with SessionLocal() as session:
        user = session.get(User, user_id)
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(403, "Неверный текущий пароль")
        new_email = normalize_email(payload.email)
        if session.scalar(select(User.id).where(or_(User.username == new_email, User.email == new_email), User.id != user_id)):
            raise HTTPException(409, "Этот email уже зарегистрирован")
        if new_email == user.email and user.email_verified_at is not None:
            return {"email": user.email, "email_verified": True}
        purpose = "verify_email" if new_email == user.email else "change_email"
        token = create_email_token(session, user.id, new_email, purpose)
        if token is None:
            raise HTTPException(429, "Письмо уже отправлено. Попробуйте через две минуты")
        try:
            send_link(new_email, token, purpose)
            session.commit()
        except (OSError, RuntimeError, smtplib.SMTPException) as error:
            session.rollback()
            raise HTTPException(503, "Не удалось отправить письмо. Попробуйте позже") from error
        return {"email": user.email, "email_verified": user.email_verified_at is not None, "pending_email": new_email}


@router.post("/verification/request")
def request_verification(payload: EmailAddress, background_tasks: BackgroundTasks):
    require_mail_config()
    email = normalize_email(payload.email)
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == email))
        if user and user.email_verified_at is None:
            token = create_email_token(session, user.id, email, "verify_email")
            if token:
                session.commit()
                background_tasks.add_task(send_link, email, token, "verify_email")
    return {"message": "Если адрес ожидает подтверждения, письмо будет отправлено. Повторная отправка доступна через две минуты"}


@router.post("/verification/confirm")
def confirm_verification(payload: EmailLinkToken, background_tasks: BackgroundTasks):
    with SessionLocal() as session:
        row = session.scalar(select(EmailToken).where(
            EmailToken.token_hash == session_hash(payload.token),
            EmailToken.purpose.in_(["verify_email", "change_email"]),
        ).with_for_update())
        if row is None or utc(row.expires_at) <= datetime.now(timezone.utc):
            raise HTTPException(400, "Ссылка недействительна или устарела")
        user = session.get(User, row.user_id)
        previous_email = user.email
        if row.purpose == "verify_email":
            if user.email != row.email:
                raise HTTPException(400, "Адрес был изменён")
        else:
            if session.scalar(select(User.id).where(User.email == row.email, User.id != user.id)):
                raise HTTPException(409, "Этот email уже зарегистрирован")
            user.email = row.email
        user.email_verified_at = datetime.now(timezone.utc)
        user.email_verification_required = False
        session.execute(delete(EmailToken).where(EmailToken.user_id == user.id, EmailToken.purpose == row.purpose))
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "Этот email уже зарегистрирован") from error
    if row.purpose == "change_email" and previous_email:
        background_tasks.add_task(send_mail, previous_email, "Email аккаунта изменён", "Адрес email вашего аккаунта был изменён. Если это были не вы, немедленно смените пароль.")
    return {"message": "Email подтверждён"}


@router.post("/password/change", status_code=204)
def change_password(payload: PasswordChange, request: Request, response: Response):
    user_id = current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Требуется вход")
    with SessionLocal() as session:
        user = session.get(User, user_id)
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(403, "Неверный текущий пароль")
        user.password_hash = hash_password(payload.new_password)
        session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
        session.execute(delete(EmailToken).where(EmailToken.user_id == user_id, EmailToken.purpose == "reset_password"))
        session.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


@router.post("/password/reset/request")
def request_password_reset(payload: EmailAddress, background_tasks: BackgroundTasks):
    require_mail_config()
    email = normalize_email(payload.email)
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == email))
        if user and user.email_verified_at is not None:
            token = create_email_token(session, user.id, email, "reset_password")
            if token:
                session.commit()
                background_tasks.add_task(send_link, email, token, "reset_password")
    return {"message": "Если адрес подтверждён, письмо для восстановления будет отправлено"}


@router.post("/password/reset/confirm", status_code=204)
def confirm_password_reset(payload: PasswordReset):
    with SessionLocal() as session:
        row = session.scalar(select(EmailToken).where(
            EmailToken.token_hash == session_hash(payload.token), EmailToken.purpose == "reset_password",
        ).with_for_update())
        if row is None or utc(row.expires_at) <= datetime.now(timezone.utc):
            raise HTTPException(400, "Ссылка недействительна или устарела")
        user = session.get(User, row.user_id)
        if user.email != row.email or user.email_verified_at is None:
            raise HTTPException(400, "Ссылка недействительна или устарела")
        user.password_hash = hash_password(payload.new_password)
        session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        session.execute(delete(EmailToken).where(EmailToken.user_id == user.id, EmailToken.purpose == "reset_password"))
        session.commit()


@router.patch("/interface-settings")
def update_interface_settings(payload: InterfaceSettingsUpdate, request: Request):
    user_id = current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Требуется вход")
    with SessionLocal() as session:
        user = session.get(User, user_id)
        user.interface_size = payload.interface_size
        session.commit()
        return {"interface_size": user.interface_size}


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
