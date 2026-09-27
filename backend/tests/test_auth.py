import unittest
from unittest.mock import patch

from fastapi import HTTPException, Response
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from backend.app import auth
from backend.app.database import Base
from backend.app.models import AuthSession, User


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

    def tearDown(self):
        self.patch.stop()
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

    def test_password_hash_has_random_salt(self):
        first = auth.hash_password("a secure password 123")
        second = auth.hash_password("a secure password 123")
        self.assertNotEqual(first, second)
        self.assertTrue(auth.verify_password("a secure password 123", first))
        self.assertFalse(auth.verify_password("different password", first))

    def test_interface_size_is_saved_for_each_user(self):
        first_response = Response()
        auth.register(auth.Registration(email="first@example.com", password="a secure password 123"), request_with_cookie(), first_response)
        first_token = first_response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]
        second_response = Response()
        auth.register(auth.Registration(email="second@example.com", password="a secure password 456"), request_with_cookie(), second_response)
        second_token = second_response.headers["set-cookie"].split("finance_session=", 1)[1].split(";", 1)[0]

        self.assertEqual(auth.profile(request_with_cookie(first_token))["interface_size"], "small")
        self.assertEqual(auth.profile(request_with_cookie(second_token))["interface_size"], "small")
        auth.update_interface_settings(auth.InterfaceSettingsUpdate(interface_size="large"), request_with_cookie(first_token))
        auth.update_interface_settings(auth.InterfaceSettingsUpdate(interface_size="medium"), request_with_cookie(second_token))
        self.assertEqual(auth.profile(request_with_cookie(first_token))["interface_size"], "large")
        self.assertEqual(auth.profile(request_with_cookie(second_token))["interface_size"], "medium")

        with self.assertRaises(HTTPException) as error:
            auth.update_interface_settings(auth.InterfaceSettingsUpdate(interface_size="small"), request_with_cookie())
        self.assertEqual(error.exception.status_code, 401)
