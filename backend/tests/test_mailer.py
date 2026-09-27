import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.app import mailer


class MailerTests(unittest.TestCase):
    def test_sends_link_over_starttls_with_authentication(self):
        settings = SimpleNamespace(
            smtp_host="smtp.example.com", smtp_port=587, smtp_sender="sender@example.com",
            smtp_username="sender@example.com", smtp_password="secret", smtp_use_ssl=False,
        )
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with patch.object(mailer, "get_settings", return_value=settings), patch.object(mailer.smtplib, "SMTP", return_value=smtp):
            mailer.send_auth_email("recipient@example.com", "Подтверждение", "https://example.com/verify-email?token=abc")
        smtp.starttls.assert_called_once()
        smtp.login.assert_called_once_with("sender@example.com", "secret")
        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "recipient@example.com")
        self.assertIn("https://example.com/verify-email?token=abc", message.get_content())
