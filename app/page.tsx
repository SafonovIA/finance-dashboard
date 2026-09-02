'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  Bus,
  Check,
  Gamepad2,
  HeartPulse,
  House,
  Landmark,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  ShoppingBasket,
  TrendingUp,
  X,
} from 'lucide-react';
import { useMonth } from '@/components/month-context';
import {
  formatCurrency,
  requestJson,
  type Account,
  type CategoryTotal,
  type Statistics,
} from '@/lib/api';

const expenseVisuals = {
  Продукты: { icon: ShoppingBasket, color: '#f0647d', background: '#2b1b2b' },
  Транспорт: { icon: Bus, color: '#76a8ef', background: '#17253b' },
  Жилье: { icon: House, color: '#d785ee', background: '#281d37' },
  Развлечения: { icon: Gamepad2, color: '#ee7f89', background: '#2a1d2a' },
  Здоровье: { icon: HeartPulse, color: '#efa56f', background: '#2a241d' },
  Другое: { icon: MoreHorizontal, color: '#e9bd65', background: '#29261d' },
};

const incomeVisuals = {
  Зарплата: BriefcaseBusiness,
  Фриланс: Palette,
  Инвестиции: TrendingUp,
  Другое: MoreHorizontal,
};

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#25415d] bg-[#0a1725] px-6 py-16 text-center lg:col-span-2">
      <p className="text-sm font-medium text-[#d8e4ef]">Статистика появится после загрузки Excel-файла</p>
      <p className="mt-2 text-xs text-[#7f91a5]">Счета можно добавить уже сейчас в карточке справа.</p>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-5 lg:grid-cols-3" aria-label="Загрузка статистики">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-[360px] animate-pulse rounded-xl border border-[#15283b] bg-card" />
      ))}
    </div>
  );
}

export default function StatisticsPage() {
  const { selectedMonth, loading: monthsLoading } = useMonth();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPageData = useCallback(async () => {
    setError(null);
    try {
      const [accountRows, statisticsData] = await Promise.all([
        requestJson<Account[]>('/api/accounts'),
        selectedMonth
          ? requestJson<Statistics>(`/api/statistics?month=${selectedMonth}`)
          : Promise.resolve(null),
      ]);
      setAccounts(accountRows);
      setStatistics(statisticsData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPageData(), 0);
    const onDataUpdated = () => void loadPageData();
    window.addEventListener('finance-data-updated', onDataUpdated);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('finance-data-updated', onDataUpdated);
    };
  }, [loadPageData]);

  const handleAccountSaved = (saved: Account) => {
    setAccounts((current) =>
      [...current.filter((account) => account.id !== saved.id), saved].sort((left, right) =>
        left.name.localeCompare(right.name, 'ru'),
      ),
    );
    window.dispatchEvent(new Event('finance-data-updated'));
  };

  if (monthsLoading || loading) return <LoadingCards />;
  if (error) return <p className="rounded-lg border border-[#5b2a32] bg-[#25151d] p-4 text-sm text-[#ff9ca8]">{error}</p>;

  return (
    <section className="grid items-start gap-5 lg:grid-cols-3">
      {statistics ? (
        <>
          <StatisticsCard
            title="Категории расходов"
            rows={statistics.expenses}
            totalLabel="Итого расходов"
            total={statistics.expense_total_cents}
            tone="expense"
          />
          <StatisticsCard
            title="Категории доходов"
            rows={statistics.incomes}
            totalLabel="Итого доходов"
            total={statistics.income_total_cents}
            tone="income"
          />
        </>
      ) : (
        <EmptyState />
      )}
      <AccountsCard accounts={accounts} onSaved={handleAccountSaved} />
    </section>
  );
}

function StatisticsCard({
  title,
  rows,
  totalLabel,
  total,
  tone,
}: {
  title: string;
  rows: CategoryTotal[];
  totalLabel: string;
  total: number;
  tone: 'expense' | 'income';
}) {
  const isExpense = tone === 'expense';
  return (
    <article className="rounded-xl border border-[#15283b] bg-card p-5 sm:p-6">
      <h2 className={`mb-5 text-sm font-semibold ${isExpense ? 'text-[#f26868]' : 'text-[#63c978]'}`}>{title}</h2>
      <ul className="space-y-2.5">
        {rows.map(({ category, amount_cents }) => {
          const expenseVisual = expenseVisuals[category as keyof typeof expenseVisuals] ?? expenseVisuals.Другое;
          const IncomeIcon = incomeVisuals[category as keyof typeof incomeVisuals] ?? MoreHorizontal;
          const Icon = isExpense ? expenseVisual.icon : IncomeIcon;
          return (
            <li key={category} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg ${isExpense ? '' : 'bg-[#173027] text-[#71d28a]'}`}
                style={isExpense ? { color: expenseVisual.color, background: expenseVisual.background } : undefined}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm text-[#d7e0ea]">{category}</span>
              <span className="ml-auto text-sm font-medium tabular-nums text-[#edf3f9]">{formatCurrency(amount_cents)}</span>
            </li>
          );
        })}
      </ul>
      <div className={`mt-5 flex items-center justify-between border-t border-[#17293c] pt-5 text-sm font-semibold ${isExpense ? 'text-[#f26868]' : 'text-[#63c978]'}`}>
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </article>
  );
}

function AccountsCard({ accounts, onSaved }: { accounts: Account[]; onSaved: (account: Account) => void }) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginCreate = () => {
    setEditingId('new');
    setName('');
    setBalance('0.00');
    setError(null);
  };

  const beginEdit = (account: Account) => {
    setEditingId(account.id);
    setName(account.name);
    setBalance((account.balance_cents / 100).toFixed(2));
    setError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setError(null);
  };

  const save = async () => {
    const amount = Number(balance.replace(',', '.'));
    if (!name.trim()) {
      setError('Введите название счёта');
      return;
    }
    if (!Number.isFinite(amount)) {
      setError('Укажите корректный остаток');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const creating = editingId === 'new';
      const saved = await requestJson<Account>(creating ? '/api/accounts' : `/api/accounts/${editingId}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), balance_cents: Math.round(amount * 100) }),
      });
      onSaved(saved);
      setEditingId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить счёт');
    } finally {
      setSaving(false);
    }
  };

  const total = accounts.reduce((sum, account) => sum + account.balance_cents, 0);

  return (
    <article className="rounded-xl border border-[#15283b] bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#76a8ef]">Счета</h2>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[#24405d] px-2 text-[11px] text-[#91b9df] transition-colors hover:bg-[#17304a]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Добавить
        </button>
      </div>

      {error ? <p className="mb-3 rounded-md bg-[#2b1720] px-3 py-2 text-xs text-[#ff9ca8]">{error}</p> : null}

      <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
        {editingId === 'new' ? (
          <AccountEditor name={name} balance={balance} saving={saving} onName={setName} onBalance={setBalance} onSave={() => void save()} onCancel={cancel} />
        ) : null}

        {accounts.length === 0 && editingId !== 'new' ? (
          <p className="rounded-lg border border-dashed border-[#25415d] px-4 py-8 text-center text-xs text-[#718398]">Добавьте первый счёт</p>
        ) : null}

        {accounts.map((account) =>
          editingId === account.id ? (
            <AccountEditor key={account.id} name={name} balance={balance} saving={saving} onName={setName} onBalance={setBalance} onSave={() => void save()} onCancel={cancel} />
          ) : (
            <div key={account.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#17253b] text-[#76a8ef]">
                <Landmark className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate text-sm text-[#d7e0ea]" title={account.name}>{account.name}</span>
              <span className={`ml-auto shrink-0 text-sm font-medium tabular-nums ${account.balance_cents < 0 ? 'text-[#f26868]' : 'text-[#edf3f9]'}`}>
                {formatCurrency(account.balance_cents)}
              </span>
              <button type="button" aria-label={`Изменить счёт ${account.name}`} title="Изменить" onClick={() => beginEdit(account)} className="inline-grid size-7 shrink-0 place-items-center rounded-md border border-[#24405d] text-[#91b9df] transition-colors hover:bg-[#17304a]">
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ),
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#17293c] pt-5 text-sm font-semibold text-[#76a8ef]">
        <span>Общий остаток</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </article>
  );
}

function AccountEditor({
  name,
  balance,
  saving,
  onName,
  onBalance,
  onSave,
  onCancel,
}: {
  name: string;
  balance: string;
  saving: boolean;
  onName: (value: string) => void;
  onBalance: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[#25415d] bg-[#0a1725] p-2.5">
      <input className="editor-control" value={name} maxLength={100} placeholder="Название счёта" aria-label="Название счёта" onChange={(event) => onName(event.target.value)} />
      <div className="flex gap-2">
        <input className="editor-control" type="number" step="0.01" value={balance} aria-label="Текущий остаток" onChange={(event) => onBalance(event.target.value)} />
        <button type="button" disabled={saving} aria-label="Сохранить счёт" onClick={onSave} className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-[#24513a] text-[#75d391] hover:bg-[#153225] disabled:opacity-50">
          <Check className="size-3.5" aria-hidden="true" />
        </button>
        <button type="button" disabled={saving} aria-label="Отменить" onClick={onCancel} className="inline-grid size-8 shrink-0 place-items-center rounded-md border border-[#49303a] text-[#d8949e] hover:bg-[#2b1720] disabled:opacity-50">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
