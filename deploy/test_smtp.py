"""Send one SMTP smoke-test email to the configured sender address."""

from backend.app.config import get_settings
from backend.app.mailer import send_mail


if __name__ == "__main__":
    send_mail(get_settings().smtp_sender, "Finance dashboard VPS test", "SMTP test from VPS.")
    print("SMTP test sent")
