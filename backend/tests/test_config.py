import unittest

from pydantic import ValidationError

from backend.app.config import Settings


class ProductionConfigTests(unittest.TestCase):
    def production_settings(self, **overrides):
        values = {
            "app_env": "production",
            "public_base_url": "https://budget.example.com",
            "frontend_url": "http://127.0.0.1:3101",
            "start_frontend": False,
            "smtp_host": "smtp.yandex.ru",
            "smtp_username": "sender",
            "smtp_password": "app-password",
            "smtp_sender": "sender@yandex.ru",
        }
        values.update(overrides)
        return Settings(_env_file=None, **values)

    def test_valid_production_configuration(self):
        self.assertEqual(self.production_settings().app_env, "production")

    def test_production_requires_https(self):
        with self.assertRaises(ValidationError):
            self.production_settings(public_base_url="http://budget.example.com")

    def test_production_requires_separate_local_frontend(self):
        with self.assertRaises(ValidationError):
            self.production_settings(start_frontend=True)
        with self.assertRaises(ValidationError):
            self.production_settings(frontend_url="https://external.example.com")

    def test_production_requires_mail_credentials(self):
        with self.assertRaises(ValidationError):
            self.production_settings(smtp_password="")
