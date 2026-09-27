import smtplib
import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import auth, database, feedback
from backend.app.database import Base
from backend.app.main import app
from backend.app.models import AuthSession, User


class FeedbackTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        sessions = sessionmaker(self.engine, expire_on_commit=False)
        with sessions() as session:
            user = User(username="tester", email="tester@example.com", password_hash="not-used")
            session.add(user)
            session.flush()
            session.add(AuthSession(
                token_hash=auth.session_hash("test-token"),
                user_id=user.id,
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            ))
            session.commit()
        self.patches = ExitStack()
        self.patches.enter_context(patch.object(auth, "SessionLocal", sessions))
        self.patches.enter_context(patch.object(database, "SessionLocal", sessions))
        self.patches.enter_context(patch.object(feedback, "require_mail_config"))
        self.patches.enter_context(patch.object(feedback, "get_settings", return_value=SimpleNamespace(feedback_recipient="safonov.gosha2016@yandex.ru")))
        self.sent = self.patches.enter_context(patch.object(feedback, "send_mail"))
        feedback._last_submission.clear()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.patches.close()
        feedback._last_submission.clear()
        self.engine.dispose()

    def test_requires_login_and_valid_message(self):
        self.assertEqual(self.client.post("/api/feedback", json={"text": "A useful message"}).status_code, 401)
        self.client.cookies.set("finance_session", "test-token")
        self.assertEqual(self.client.post("/api/feedback", json={"text": "   "}).status_code, 422)
        self.assertEqual(self.client.post("/api/feedback", json={"text": "x" * 4001}).status_code, 422)
        self.sent.assert_not_called()

    def test_sends_to_owner_and_limits_frequency(self):
        self.client.cookies.set("finance_session", "test-token")
        result = self.client.post("/api/feedback", json={"text": "  Помогите разобраться с загрузкой  "})
        self.assertEqual(result.status_code, 200, result.text)
        recipient, subject, body = self.sent.call_args.args
        self.assertEqual(recipient, "safonov.gosha2016@yandex.ru")
        self.assertIn("Обратная связь", subject)
        self.assertIn("tester@example.com", body)
        self.assertIn("Помогите разобраться с загрузкой", body)
        self.assertEqual(self.client.post("/api/feedback", json={"text": "Ещё одно сообщение"}).status_code, 429)
        self.sent.assert_called_once()

    def test_delivery_failure_is_reported_and_can_be_retried(self):
        self.client.cookies.set("finance_session", "test-token")
        self.sent.side_effect = smtplib.SMTPException("offline")
        result = self.client.post("/api/feedback", json={"text": "Сообщение для поддержки"})
        self.assertEqual(result.status_code, 502)
        self.sent.side_effect = None
        self.assertEqual(self.client.post("/api/feedback", json={"text": "Сообщение для поддержки"}).status_code, 200)
