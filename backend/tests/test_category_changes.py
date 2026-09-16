import unittest
from datetime import date

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.database import Base
from backend.app.models import Account, Category, CategoryRule, Transaction, TransactionType
from backend.app.api import update_category, update_transaction, move_category, move_account, list_accounts, place_category, place_account, delete_account
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

    def test_new_icons_and_colors_persist(self):
        for icon in ("bottle", "arrows", "dollar"):
            update_category(self.category.id, CategoryUpdate(name="custom", icon=icon, icon_color="#12abEF"), self.session)
            self.session.expire_all()
            self.assertEqual(self.category.icon, icon)
            self.assertEqual(self.category.icon_color, "#12abEF")
        update_category(self.category.id, CategoryUpdate(name="custom", icon="gift"), self.session)
        self.assertEqual(self.category.icon_color, "#12abEF")

    def test_invalid_color_is_rejected(self):
        from pydantic import ValidationError
        for color in ("red", "#123", "#gggggg", "url(test)"):
            with self.assertRaises(ValidationError):
                CategoryUpdate(name="custom", icon_color=color)

    def test_category_order_is_persistent_and_scoped(self):
        other = Category(name="second", type=TransactionType.expense, sort_order=1)
        income = Category(name="income", type=TransactionType.income, sort_order=7)
        self.session.add_all([other, income])
        self.session.commit()
        move_category(self.category.id, self.session, "down")
        self.session.expire_all()
        ordered = list(self.session.scalars(select(Category).where(Category.type == TransactionType.expense).order_by(Category.sort_order)))
        self.assertEqual([row.id for row in ordered], [other.id, self.category.id])
        self.assertEqual(income.sort_order, 7)
        move_category(self.category.id, self.session, "down")
        self.assertEqual(self.category.sort_order, 1)
        move_category(self.category.id, self.session, "up")
        self.assertEqual(self.category.sort_order, 0)
        self.assertEqual(self.transaction.amount_cents, 50000)

    def test_account_order_is_persistent_and_keeps_balances(self):
        second = Account(name="zzz", balance_adjustment_cents=12345)
        self.session.add(second)
        self.session.commit()
        before = {row.id: row.balance_cents for row in list_accounts(self.session)}
        move_account(second.id, self.session, "up")
        self.session.expire_all()
        rows = list_accounts(self.session)
        self.assertEqual(rows[0].id, second.id)
        self.assertEqual({row.id: row.balance_cents for row in rows}, before)
        move_account(second.id, self.session, "down")
        self.assertEqual(list_accounts(self.session)[-1].id, second.id)

    def test_drop_category_across_multiple_rows_and_reject_other_panel(self):
        middle = Category(name="middle", type=TransactionType.expense, sort_order=1)
        last = Category(name="last", type=TransactionType.expense, sort_order=2)
        income = Category(name="income", type=TransactionType.income)
        self.session.add_all([middle, last, income])
        self.session.commit()
        place_category(self.category.id, last.id, self.session)
        self.session.expire_all()
        rows = list(self.session.scalars(select(Category).where(Category.type == TransactionType.expense).order_by(Category.sort_order)))
        self.assertEqual([row.id for row in rows], [middle.id, last.id, self.category.id])
        place_category(self.category.id, middle.id, self.session)
        self.assertEqual(self.category.sort_order, 0)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            place_category(self.category.id, income.id, self.session)
        self.session.rollback()

    def test_drop_account_keeps_balances(self):
        last = Account(name="zzz", balance_adjustment_cents=100)
        self.session.add(last)
        self.session.commit()
        initial = list_accounts(self.session)
        place_account(last.id, initial[0].id, self.session)
        self.session.expire_all()
        result = list_accounts(self.session)
        self.assertEqual(result[0].id, last.id)
        self.assertEqual({row.id: row.balance_cents for row in initial}, {row.id: row.balance_cents for row in result})

    def test_delete_fallback_account_removes_all_its_operations_only(self):
        account = self.session.get(Account, self.transaction.account_id)
        account.name = "Без счёта"
        other = Account(name="keep", balance_adjustment_cents=123)
        self.session.add(other)
        self.session.flush()
        excluded = Transaction(occurred_on=date(2026, 9, 1), amount_cents=100, category="custom", source=account.name, account_id=account.id, type=TransactionType.expense, included_in_analytics=False)
        kept = Transaction(occurred_on=date(2026, 9, 1), amount_cents=50, category="custom", source=other.name, account_id=other.id, type=TransactionType.expense)
        self.session.add_all([excluded, kept])
        self.session.commit()
        account_id, kept_id = account.id, kept.id
        delete_account(account_id, self.session)
        self.session.expire_all()
        self.assertIsNone(self.session.get(Account, account_id))
        self.assertEqual([row.id for row in self.session.scalars(select(Transaction))], [kept_id])
        self.assertEqual(self.session.get(Account, other.id).balance_adjustment_cents, 123)

    def test_delete_empty_account(self):
        account = Account(name="empty")
        self.session.add(account)
        self.session.commit()
        account_id = account.id
        delete_account(account_id, self.session)
        self.assertIsNone(self.session.get(Account, account_id))
        self.assertIsNotNone(self.session.get(Transaction, self.transaction.id))
