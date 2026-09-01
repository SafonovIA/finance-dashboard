import unittest
from datetime import datetime

from backend.app.importer import parse_transaction
from backend.app.models import TransactionKind, TransactionType


def operation(**overrides):
    row = {
        "Имя счёта": "Основной",
        "Номер карты": "*1234",
        "Дата операции": datetime(2026, 8, 10, 12, 30),
        "Сумма в валюте счёта": -500,
        "Валюта счёта": "RUB",
        "Статус": "Ок",
        "Категория по-умолчанию": "Супермаркеты",
        "Описание": "Магазин",
        "Сообщение": None,
        "MCC": 5411,
        "Учёт в аналитике": "Да",
    }
    row.update(overrides)
    return row


class ImporterTests(unittest.TestCase):
    def test_purchase_is_mapped_to_reference_category(self):
        transaction = parse_transaction(operation())

        self.assertEqual(transaction.type, TransactionType.expense)
        self.assertEqual(transaction.kind, TransactionKind.purchase)
        self.assertEqual(transaction.category, "Продукты")
        self.assertTrue(transaction.included_in_analytics)

    def test_internal_transfer_is_excluded(self):
        transaction = parse_transaction(
            operation(
                **{
                    "Сумма в валюте счёта": 1000,
                    "Категория по-умолчанию": "Переводы",
                    "Описание": "Между своими счетами",
                    "Учёт в аналитике": "Нет",
                }
            )
        )

        self.assertEqual(transaction.kind, TransactionKind.internal_transfer)
        self.assertFalse(transaction.included_in_analytics)

    def test_positive_merchant_operation_is_a_refund(self):
        transaction = parse_transaction(
            operation(**{"Сумма в валюте счёта": 999})
        )

        self.assertEqual(transaction.type, TransactionType.expense)
        self.assertEqual(transaction.kind, TransactionKind.refund)

    def test_saved_merchant_rule_has_priority(self):
        row = operation()
        transaction = parse_transaction(
            row,
            {("магазин", TransactionType.expense): "Другое"},
        )

        self.assertEqual(transaction.category, "Другое")


if __name__ == "__main__":
    unittest.main()
