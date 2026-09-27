"""SMTP delivery for account verification and password recovery."""

import smtplib
import ssl
from email.message import EmailMessage

from fastapi import HTTPException

from backend.app.config import get_settings


def require_mail_config() -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_sender:
        raise HTTPException(503, "Отправка почты не настроена на сервере")


def send_mail(recipient: str, subject: str, body: str) -> None:
    require_mail_config()
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.smtp_sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10, context=ssl.create_default_context()) as client:
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as client:
            client.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)


def send_auth_email(recipient: str, subject: str, link: str) -> None:
    send_mail(recipient, subject, f"Откройте ссылку для продолжения:\n{link}\n\nЕсли вы не запрашивали это письмо, проигнорируйте его.")
