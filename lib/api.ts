export type TransactionType = 'expense' | 'income';

export type TransactionKind =
  | 'purchase'
  | 'income'
  | 'internal_transfer'
  | 'external_transfer'
  | 'refund'
  | 'top_up'
  | 'error'
  | 'manual';

export type Transaction = {
  id: number;
  occurred_on: string;
  amount_cents: number;
  category: string;
  comment: string | null;
  source: string;
  account_id: number;
  type: TransactionType;
  kind: TransactionKind;
  included_in_analytics: boolean;
  merchant: string | null;
  bank_category: string | null;
  mcc: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Account = {
  id: number;
  name: string;
  balance_cents: number;
  transaction_count: number;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: number;
  name: string;
  icon: string;
  icon_color: string;
  type: TransactionType;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type Categories = {
  expense: Category[];
  income: Category[];
};

export type MonthDeleteResult = {
  month: string;
  deleted_rows: number;
};

export type Statistics = {
  month: string;
  expenses: CategoryTotal[];
  incomes: CategoryTotal[];
  expense_total_cents: number;
  income_total_cents: number;
  balance_cents: number;
};

export type CategoryTotal = {
  category: string;
  amount_cents: number;
};

export type ImportResult = {
  id: number;
  filename: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  excluded_rows: number;
  error_rows: number;
  month: string | null;
};

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) {
    let detail = 'Не удалось выполнить запрос';
    try {
      const body = (await response.json()) as { detail?: string | { msg?: string }[] };
      if (typeof body.detail === 'string') detail = body.detail;
      if (Array.isArray(body.detail)) detail = body.detail[0]?.msg ?? detail;
    } catch {
      // The server returned a non-JSON error response.
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function formatCurrency(amountCents: number): string {
  const hasKopecks = Math.abs(amountCents) % 100 !== 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: hasKopecks ? 2 : 0,
    minimumFractionDigits: hasKopecks ? 2 : 0,
  }).format(amountCents / 100);
}
