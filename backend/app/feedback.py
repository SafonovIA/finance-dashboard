"""Authenticated feedback delivered to the application owner by email."""

import logging
import smtplib
import time
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.app.config import get_settings
from backend.app.database import get_session
from backend.app.mailer import require_mail_config, send_mail
from backend.app.models import User


router = APIRouter(prefix="/api/feedback", tags=["feedback"])
COOLDOWN_SECONDS = 60
_last_submission: dict[int, float] = {}
_submission_lock = Lock()
logger = logging.getLogger(__name__)


class FeedbackMessage(BaseModel):
    text: str = Field(min_length=10, max_length=4000)

    @field_validator("text")
    @classmethod
    def strip_and_validate(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Сообщение должно содержать не менее 10 символов")
        return value


@router.post("")
async def submit_feedback(
    payload: FeedbackMessage,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str]:
    user_id = request.state.user_id
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Требуется вход")
    require_mail_config()

    now = time.monotonic()
    with _submission_lock:
        if now - _last_submission.get(user_id, float("-inf")) < COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail="Подождите минуту перед следующим сообщением")
        _last_submission[user_id] = now

    body = f"Пользователь: {user.email or user.username}\nID: {user.id}\n\n{payload.text}\n"
    try:
        await run_in_threadpool(
            send_mail,
            get_settings().feedback_recipient,
            "Обратная связь — Финансовая статистика",
            body,
        )
    except (smtplib.SMTPException, OSError):
        with _submission_lock:
            if _last_submission.get(user_id) == now:
                _last_submission.pop(user_id, None)
        logger.exception("Feedback email delivery failed for user %s", user_id)
        raise HTTPException(status_code=502, detail="Не удалось отправить сообщение. Попробуйте позже") from None

    return {"message": "Сообщение отправлено"}
