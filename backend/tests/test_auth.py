import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException, Response
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from backend.app import auth
from backend.app.database import Base
from backend.app.models import AuthSession, EmailToken, User


def request_with_cookie(token: str | None = None) -> Request:
    headers = [(b"cookie", f"finance_session={token}".encode())] if token else []
    return Request({"type": "http", "method": "GET", "scheme": "http", "server": ("localhost", 8001), "path": "/", "headers": headers, "query_string": b""})


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.patch = patch.object(auth, "SessionLocal", self.sessions)
        self.patch.start()
        self.mail_patch = patch.object(auth, "require_mail_config")
        self.mail_patch.start()
        self.send_patch = patch.object(auth, "send_link")
        self.sent = self.send_patch.start()

    def tearDown(self):
        self.patch.stop()
        self.mail_patch.stop()
        self.send_patch.stop()
        self.engine.dispose()

    def test_setup_login_and_logout(self):
        credentials = auth.Credentials(username="owner", password="a secure password 123")
        self.assertTrue(auth.status(request_with_cookie())["setup_required"])
        response = Response()
        auth.setup(credentials, request_with_cookie(), response)
        cookie = response.headers["set-cookie"]
        self.assertIn("httponly", cookie.lower())
        self.assertIn("samesite=strict", cookie.lower())
        token = cookie.split("finance_session=", 1)[1].split(";", 1)[0]
        self.assertIsNotNone(auth.current_user_id(request_with_cookie(token)))
        with self.assertRaises(HTTPException):
            auth.setup(auth.Credentials(username="another", password="another secure password"), request_with_cookie(), Response())
        with self.assertRaises(HTTPException):
            auth.login(auth.Credentials(username="owner", password="incorrect password"), request_with_cookie(), Response())
        with self.sessions() as session:
            self.assertEqual(session.scalar(select(User)).username, "owner")
            self.assertNotEqual(session.scalar(select(User)).password_hash, credentials.password)
            self.assertNotEqual(session.scalar(select(AuthSession)).token_hash, token)
        auth.logout(request_with_cookie(token), Response())
        self.assertIsNone(auth.current_user_id(request_with_cookie(token)))
        next_response = Response()
        auth.login(credentials, request_with_cookie(), next_response)
        self.assertIn("finance_session=", next_response.headers["set-cookie"])

    def test_setup_is_disabled_in_production(self):
        with patch.object(auth, "get_settings", return_value=SimpleNamespace(app_env="production")):
            with self.assertRaises(HTTPException) as error:
                auth.setup(auth.Credentials(username="owner", password="a secure password 123"), request_with_cookie(), Response())
        self.assertEqual(error.exception.status_code, 404)
        with self.sessions() as session:
            self.assertIsNone(session.scalar(select(User)))

    def test_password_hash_has_random_salt(self):
        first = auth.hash_password("a secure password 123")
        second = auth.hash_password("a secure password 123")
        self.assertNotEqual(first, second)
        self.assertTrue(auth.verify_password("a secure password 123", first))
        self.assertFalse(auth.verify_password("different password", first))

    def test_production_session_cookie_is_secure(self):
        credentials = auth.Credentials(username="owner", password="a secure password 123")
        auth.setup(credentials, request_with_cookie(), Response())
        response = Response()
        with patch.object(auth, "get_settings", return_value=SimpleNamespace(app_env="production")):
            auth.login(credentials, request_with_cookie(), response)
        self.assertIn("secure", response.headers["set-cookie"].lower())

    def test_interface_size_is_saved_for_each_user(self):
        first_response = Response()
        auth.register(auth.Registration(email="first@example.com", password="a secure password 123"), request_with_cookie(), first_response)
        first_verification = self.sent.call_args.args[1]
        with self.assertRaises(HTTPException) as blocked:
            auth.login(auth.Credentials(username="first@example.com", password="a secure password 123"), request_with_cookie(), Response())
        self.assertEqual(blocked.exception.status_code, 403)
        auth.confirm_verification(auth.EmailLinkToken(token=first_verification), BackgroundTasks())
        first_response = Response()
        auth.login(auth.Credentials(username="first@example.com", password="a secure password 123"), request_with_cookie(), first_response)
        first_token = first_response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]
        second_response = Response()
        auth.register(auth.Registration(email="second@example.com", password="a secure password 456"), request_with_cookie(), second_response)
        auth.confirm_verification(auth.EmailLinkToken(token=self.sent.call_args.args[1]), BackgroundTasks())
        second_response = Response()
        auth.login(auth.Credentials(username="second@example.com", password="a secure password 456"), request_with_cookie(), second_response)
        second_token = second_response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]

        self.assertEqual(auth.profile(request_with_cookie(first_token), Response())["interface_size"], "small")
        self.assertEqual(auth.profile(request_with_cookie(second_token), Response())["interface_size"], "small")
        first_update_response = Response()
        auth.update_interface_settings(auth.InterfaceSettingsUpdate(interface_size="large"), request_with_cookie(first_token), first_update_response)
        self.assertIn("finance_interface_size=large", first_update_response.headers["set-cookie"])
        auth.update_interface_settings(auth.InterfaceSettingsUpdate(interface_size="medium"), request_with_cookie(second_token), Response())
        self.assertEqual(auth.profile(request_with_cookie(first_token), Response())["interface_size"], "large")
        self.assertEqual(auth.profile(request_with_cookie(second_token), Response())["interface_size"], "medium")
        first_profile_response = Response()
        auth.profile(request_with_cookie(first_token), first_profile_response)
        self.assertIn("finance_interface_size=large", first_profile_response.headers["set-cookie"])
        new_login_response = Response()
        auth.login(auth.Credentials(username="first@example.com", password="a secure password 123"), request_with_cookie(), new_login_response)
        self.assertTrue(any(b"finance_interface_size=large" in value for key, value in new_login_response.raw_headers if key == b"set-cookie"))

        with self.assertRaises(HTTPException) as error:
            auth.update_interface_settings(auth.InterfaceSettingsUpdate(interface_size="small"), request_with_cookie(), Response())
        self.assertEqual(error.exception.status_code, 401)

    def test_password_reset_requires_verified_email_and_revokes_sessions(self):
        auth.register(auth.Registration(email="first@example.com", password="a secure password 123"), request_with_cookie(), Response())
        tasks = BackgroundTasks()
        auth.request_password_reset(auth.EmailAddress(email="first@example.com"), tasks)
        self.assertEqual(len(tasks.tasks), 0)
        auth.confirm_verification(auth.EmailLinkToken(token=self.sent.call_args.args[1]), BackgroundTasks())
        login_response = Response()
        auth.login(auth.Credentials(username="first@example.com", password="a secure password 123"), request_with_cookie(), login_response)
        login_token = login_response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]
        unknown_tasks = BackgroundTasks()
        auth.request_password_reset(auth.EmailAddress(email="unknown@example.com"), unknown_tasks)
        self.assertEqual(len(unknown_tasks.tasks), 0)
        tasks = BackgroundTasks()
        auth.request_password_reset(auth.EmailAddress(email="first@example.com"), tasks)
        reset_token = tasks.tasks[0].args[1]
        auth.confirm_password_reset(auth.PasswordReset(token=reset_token, new_password="a different password 456"))
        self.assertIsNone(auth.current_user_id(request_with_cookie(login_token)))
        with self.assertRaises(HTTPException):
            auth.confirm_password_reset(auth.PasswordReset(token=reset_token, new_password="another password 456"))
        with self.assertRaises(HTTPException):
            auth.login(auth.Credentials(username="first@example.com", password="a secure password 123"), request_with_cookie(), Response())
        auth.login(auth.Credentials(username="first@example.com", password="a different password 456"), request_with_cookie(), Response())

    def test_email_change_requires_password_and_confirmation(self):
        auth.setup(auth.Credentials(username="owner", password="a secure password 123"), request_with_cookie(), Response())
        login_response = Response()
        auth.login(auth.Credentials(username="owner", password="a secure password 123"), request_with_cookie(), login_response)
        token = login_response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]
        with self.assertRaises(HTTPException):
            auth.update_profile(auth.EmailUpdate(email="new@example.com", current_password="wrong"), request_with_cookie(token))
        auth.update_profile(auth.EmailUpdate(email="new@example.com", current_password="a secure password 123"), request_with_cookie(token))
        self.assertIsNone(auth.profile(request_with_cookie(token), Response())["email"])
        auth.confirm_verification(auth.EmailLinkToken(token=self.sent.call_args.args[1]), BackgroundTasks())
        self.assertEqual(auth.profile(request_with_cookie(token), Response())["email"], "new@example.com")

    def test_expired_verification_link_cannot_be_used_twice(self):
        auth.register(auth.Registration(email="first@example.com", password="a secure password 123"), request_with_cookie(), Response())
        token = self.sent.call_args.args[1]
        with self.sessions() as session:
            row = session.scalar(select(EmailToken))
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            session.commit()
        with self.assertRaises(HTTPException) as expired:
            auth.confirm_verification(auth.EmailLinkToken(token=token), BackgroundTasks())
        self.assertEqual(expired.exception.status_code, 400)
        with self.sessions() as session:
            session.scalar(select(EmailToken)).expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            session.commit()
        auth.confirm_verification(auth.EmailLinkToken(token=token), BackgroundTasks())
        with self.assertRaises(HTTPException):
            auth.confirm_verification(auth.EmailLinkToken(token=token), BackgroundTasks())

    def test_password_change_requires_old_password_and_revokes_session(self):
        response = Response()
        auth.setup(auth.Credentials(username="owner", password="a secure password 123"), request_with_cookie(), response)
        token = response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]
        with self.assertRaises(HTTPException) as denied:
            auth.change_password(auth.PasswordChange(current_password="wrong", new_password="a different password 456"), request_with_cookie(token), Response())
        self.assertEqual(denied.exception.status_code, 403)
        auth.change_password(auth.PasswordChange(current_password="a secure password 123", new_password="a different password 456"), request_with_cookie(token), Response())
        self.assertIsNone(auth.current_user_id(request_with_cookie(token)))
        auth.login(auth.Credentials(username="owner", password="a different password 456"), request_with_cookie(), Response())
