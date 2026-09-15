import unittest
from datetime import date

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.database import Base
from backend.app.models import Account, Category, CategoryRule, Transaction, TransactionType
from backend.app.api import update_category, update_transaction
from backend.app.schemas import CategoryUpdate, TransactionUpdate
from backend.app.importer import parse_transaction
from backend.tests.test_importer import operation


class CategoryChangesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.category = Category(name="custom", type=TransactionType.expense, icon="gift")
        account = Account(name="test")
        self.session.add_all([self.category, account])
        self.session.flush()
        self.transaction = Transaction(occurred_on=date(2026, 8, 10), amount_cents=50000, category="Продукты", source="test", account_id=account.id, type=TransactionType.expense, merchant="Магазин")
        self.session.add(self.transaction)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_correction_survives_rename_and_future_import(self):
        update_transaction(self.transaction.id, TransactionUpdate(category="custom"), self.session)
        update_category(self.category.id, CategoryUpdate(name="renamed", icon="book"), self.session)
        self.session.expire_all()
        rule = self.session.scalar(select(CategoryRule))
        parsed = parse_transaction(operation(**{"Описание": "  МАГАЗИН  "}), {(rule.merchant_key, rule.type): rule.category})
        self.assertEqual(parsed.category, "renamed")
        self.assertEqual(self.transaction.category, "renamed")
        self.assertEqual(self.category.icon, "book")

    def test_unmodified_category_does_not_overwrite_rule(self):
        self.session.add(Category(name="Продукты", type=TransactionType.expense))
        self.transaction.category = "custom"
        self.session.add(CategoryRule(merchant_key="магазин", type=TransactionType.expense, category="preferred"))
        self.session.commit()
        update_transaction(self.transaction.id, TransactionUpdate(category="custom", comment="Changed"), self.session)
        self.assertEqual(self.session.scalar(select(CategoryRule)).category, "preferred")

    def test_system_category_can_change_icon_but_not_name(self):
        self.category.is_system = True
        self.session.commit()
        update_category(self.category.id, CategoryUpdate(name="custom", icon="wallet"), self.session)
        self.assertEqual(self.category.icon, "wallet")
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            update_category(self.category.id, CategoryUpdate(name="renamed"), self.session)
