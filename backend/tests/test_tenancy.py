import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException, Response
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, func, select, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from backend.app import auth
from backend.app import database
from backend.app.api import delete_account, statistics
from backend.app.database import Base
from backend.app.models import Account, Category, CategoryRule, ImportBatch, Transaction, TransactionType, User


def request() -> Request:
    return Request({"type": "http", "method": "POST", "scheme": "http", "server": ("localhost", 8001), "path": "/api/auth/register", "headers": [], "query_string": b""})


class TenantIsolationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.patch = patch.object(auth, "SessionLocal", self.sessions)
        self.patch.start()
        for email in ("a@example.com", "b@example.com"):
            auth.register(auth.Registration(email=email, password="secure password 123"), request(), Response())
        with self.sessions() as session:
            self.users = list(session.scalars(select(User).order_by(User.id)))

    def tearDown(self):
        self.patch.stop()
        self.engine.dispose()

    def tenant(self, index: int):
        session = self.sessions()
        session.info["tenant_id"] = self.users[index].id
        return session

    def test_registration_creates_independent_default_categories(self):
        with self.tenant(0) as first, self.tenant(1) as second:
            names_a = list(first.scalars(select(Category.name)))
            names_b = list(second.scalars(select(Category.name)))
            self.assertEqual(names_a, names_b)
            self.assertEqual(len(names_a), 10)
            self.assertFalse({row.id for row in first.scalars(select(Category))} & {row.id for row in second.scalars(select(Category))})
        with self.assertRaises(HTTPException):
            auth.register(auth.Registration(email="A@example.com", password="secure password 123"), request(), Response())

    def test_reads_edits_deletes_import_rules_and_statistics_are_isolated(self):
        ids = []
        for index in (0, 1):
            with self.tenant(index) as session:
                account = Account(name="Основной", balance_adjustment_cents=0)
                batch = ImportBatch(filename="same.xlsx")
                rule = CategoryRule(merchant_key="магазин", type=TransactionType.expense, category="Продукты")
                session.add_all([account, batch, rule])
                session.flush()
                transaction = Transaction(occurred_on=date(2026, 9, 1), amount_cents=(index + 1) * 10000,
                    category="Продукты", source="Основной", type=TransactionType.expense,
                    account_id=account.id, import_batch_id=batch.id, fingerprint="same-fingerprint")
                session.add(transaction)
                session.commit()
                ids.append((account.id, transaction.id, batch.id))
        with self.tenant(0) as first:
            self.assertEqual(first.scalar(select(func.count(Transaction.id))), 1)
            self.assertEqual(statistics(first, "2026-09").expense_total_cents, 10000)
            self.assertEqual(first.get(Account, ids[1][0]), None)
            self.assertEqual(first.get(Transaction, ids[1][1]), None)
            self.assertEqual(first.get(ImportBatch, ids[1][2]), None)
            self.assertEqual(first.scalar(select(func.count(CategoryRule.id))), 1)
            changed = first.execute(update(Transaction).values(category="Другое"))
            self.assertEqual(changed.rowcount, 1)
            first.commit()
            with self.assertRaises(HTTPException):
                delete_account(ids[1][0], first)
            removed = first.execute(delete(Transaction))
            self.assertEqual(removed.rowcount, 1)
            first.commit()
        with self.tenant(1) as second:
            self.assertEqual(second.get(Transaction, ids[1][1]).category, "Продукты")
            self.assertEqual(statistics(second, "2026-09").expense_total_cents, 20000)
            self.assertEqual(second.scalar(select(func.count(Transaction.id))), 1)

    def test_cannot_attach_other_users_row(self):
        with self.tenant(1) as second:
            other = second.scalar(select(Account))
            if other is None:
                other = Account(name="other")
                second.add(other)
                second.commit()
            other_id = other.id
        with self.tenant(0) as first:
            with self.assertRaises(ValueError):
                first.add(Account(user_id=self.users[1].id, name="forged"))
                first.flush()
            first.rollback()
            self.assertIsNone(first.get(Account, other_id))

    def test_http_sessions_cannot_see_each_others_data(self):
        from backend.app.main import app
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        sessions = sessionmaker(engine, expire_on_commit=False)
        with patch.object(auth, "SessionLocal", sessions), patch.object(database, "SessionLocal", sessions):
            first, second = TestClient(app), TestClient(app)
            self.assertEqual(first.get("/api/accounts").status_code, 401)
            for client, email in ((first, "first@example.com"), (second, "second@example.com")):
                response = client.post("/api/auth/register", json={"email": email, "password": "secure password 123"})
                self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(first.post("/api/accounts", json={"name": "Same account", "balance_cents": 0}).status_code, 201)
            self.assertEqual(second.post("/api/accounts", json={"name": "Same account", "balance_cents": 0}).status_code, 201)
            first_account = first.get("/api/accounts").json()[0]["id"]
            second_account = second.get("/api/accounts").json()[0]["id"]
            self.assertNotEqual(first_account, second_account)
            self.assertEqual(first.post("/api/categories", json={"name": "Groceries", "type": "expense"}).status_code, 201)
            self.assertEqual(first.post("/api/transactions", json={
                "occurred_on": "2026-09-01", "amount_cents": 50000, "category": "Groceries",
                "comment": "first only", "source": "Same account", "account_id": first_account, "type": "expense",
            }).status_code, 201)
            self.assertEqual(len(second.get("/api/transactions?month=2026-09").json()), 0)
            self.assertEqual(second.get("/api/statistics?month=2026-09").json()["expense_total_cents"], 0)
            self.assertEqual(second.delete(f"/api/accounts/{first_account}").status_code, 404)
            self.assertEqual(len(first.get("/api/transactions?month=2026-09").json()), 1)
            first.post("/api/auth/logout")
            self.assertEqual(first.get("/api/accounts").status_code, 401)
        engine.dispose()
