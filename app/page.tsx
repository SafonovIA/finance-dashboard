'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GripVertical,
  Check,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMonth } from '@/components/month-context';
import { FinanceCharts } from '@/components/finance-charts';
import { CategoryIcon, ColorPicker, IconPicker } from '@/components/category-icon';
import {
  formatCurrency,
  requestJson,
  type Account,
  type Categories,
  type Category,
  type CategoryTotal,
  type Statistics,
  type TransactionType,
} from '@/lib/api';

const emptyCategories: Categories = { expense: [], income: [] };

function LoadingCards() {
  return (
    <div className="grid gap-5 lg:grid-cols-3" aria-label="Загрузка статистики">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-[414px] animate-pulse rounded-xl border border-[#15283b] bg-card" />
      ))}
    </div>
  );
}

export default function StatisticsPage() {
  const { selectedMonth, loading: monthsLoading } = useMonth();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Categories>(emptyCategories);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPageData = useCallback(async () => {
    setError(null);
    try {
      const [accountRows, categoryRows, statisticsData] = await Promise.all([
        requestJson<Account[]>('/api/accounts'),
        requestJson<Categories>('/api/categories'),
        selectedMonth
          ? requestJson<Statistics>(`/api/statistics?month=${selectedMonth}`)
          : Promise.resolve(null),
      ]);
      setAccounts(accountRows);
      setCategories(categoryRows);
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

  const expenseRows = useMemo(
    () => categoryRows(categories.expense, statistics?.expenses ?? []),
    [categories.expense, statistics?.expenses],
  );
  const incomeRows = useMemo(
    () => categoryRows(categories.income, statistics?.incomes ?? []),
    [categories.income, statistics?.incomes],
  );

  if (monthsLoading || loading) return <LoadingCards />;
  if (error) return <p className="rounded-lg border border-[#5b2a32] bg-[#25151d] p-4 text-sm text-[#ff9ca8]">{error}</p>;

  return (
    <div className="space-y-5"><section className="grid gap-5 lg:grid-cols-3">
      <StatisticsCard
        title="Категории расходов"
        rows={expenseRows}
        totalLabel="Итого расходов"
        total={statistics?.expense_total_cents ?? 0}
        tone="expense"
        onChanged={loadPageData}
      />
      <StatisticsCard
        title="Категории доходов"
        rows={incomeRows}
        totalLabel="Итого доходов"
        total={statistics?.income_total_cents ?? 0}
        tone="income"
        onChanged={loadPageData}
      />
      <AccountsCard accounts={accounts} onChanged={loadPageData} />
    </section><FinanceCharts statistics={statistics} categories={categories} /></div>
  );
}

function categoryRows(categories: Category[], totals: CategoryTotal[]) {
  const amounts = new Map(totals.map((item) => [item.category, item.amount_cents]));
  return categories.map((category) => ({ category, amount_cents: amounts.get(category.name) ?? 0 }));
}

function StatisticsCard({
  title,
  rows,
  totalLabel,
  total,
  tone,
  onChanged,
}: {
  title: string;
  rows: { category: Category; amount_cents: number }[];
  totalLabel: string;
  total: number;
  tone: TransactionType;
  onChanged: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('other');
  const [iconColor, setIconColor] = useState('#78b4f4');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExpense = tone === 'expense';
  const ordering = useOrdering('categories', onChanged);

  const beginCreate = () => {
    setEditingId('new');
    setName('');
    setIcon('other');
    setIconColor(isExpense ? '#e995a3' : '#8fc6a4');
    setError(null);
  };

  const beginEdit = (category: Category) => {
    setEditingId(category.id);
    setName(category.name);
    setIcon(category.icon);
    setIconColor(category.icon_color);
    setError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setError(null);
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Введите название категории');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const creating = editingId === 'new';
      await requestJson<Category>(creating ? '/api/categories' : `/api/categories/${editingId}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creating ? { name: name.trim(), type: tone, icon, icon_color: iconColor } : { name: name.trim(), icon, icon_color: iconColor }),
      });
      setEditingId(null);
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить категорию');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: Category) => {
    if (!window.confirm(`Удалить категорию «${category.name}»? Связанные операции перейдут в «Другое».`)) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson<void>(`/api/categories/${category.id}`, { method: 'DELETE' });
      if (editingId === category.id) setEditingId(null);
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось удалить категорию');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="flex h-[32rem] min-w-0 flex-col rounded-xl border border-[#15283b] bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={`text-sm font-semibold ${isExpense ? 'text-[#f26868]' : 'text-[#63c978]'}`}>{title}</h2>
        <button type="button" onClick={beginCreate} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded-md border border-[#24405d] px-2 text-[13px] text-[#91b9df] transition-colors hover:bg-[#17304a] disabled:opacity-50">
          <Plus className="size-3.5" aria-hidden="true" />
          Добавить
        </button>
      </div>

      {error ? <p className="mb-3 rounded-md bg-[#2b1720] px-3 py-2 text-xs text-[#ff9ca8]">{error}</p> : null}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {editingId === 'new' ? (
          <CategoryEditor name={name} icon={icon} color={iconColor} onColor={setIconColor} onIcon={setIcon} saving={saving} onName={setName} onSave={() => void save()} onCancel={cancel} />
        ) : null}
        {ordering.error && <li role="alert" className="text-xs text-[#ff9ca8]">{ordering.error}</li>}
        {rows.map(({ category, amount_cents }) => {
          if (editingId === category.id) {
            return <CategoryEditor key={category.id} name={name} icon={icon} color={iconColor} onColor={setIconColor} onIcon={setIcon} system={category.is_system} saving={saving} onName={setName} onSave={() => void save()} onCancel={cancel} />;
          }
          return (
            <li key={category.id} {...ordering.dragProps(category.id, saving || editingId !== null)} className={`flex items-center gap-2 rounded-lg px-1 py-1.5 ${ordering.over === category.id ? 'bg-[#17304a] ring-1 ring-[#78b4f4]' : ''}`}>
              <GripVertical className="size-3.5 shrink-0 text-[#718398]" aria-hidden="true" />
              <span className="grid size-8 shrink-0 place-items-center">
                <CategoryIcon icon={category.icon} color={category.icon_color} />
              </span>
              <span className="min-w-0 truncate text-sm text-[#d7e0ea]" title={category.name}>{category.name}</span>
              <span className="ml-auto shrink-0 text-sm font-medium tabular-nums text-[#edf3f9]">{formatCurrency(amount_cents)}</span>
              {(
                <div className="flex shrink-0 gap-1">
                  <SmallButton label={`Изменить категорию ${category.name}`} onClick={() => beginEdit(category)}><Pencil className="size-3.5" /></SmallButton>
                  {!category.is_system && <SmallButton danger label={`Удалить категорию ${category.name}`} disabled={saving} onClick={() => void remove(category)}><Trash2 className="size-3.5" /></SmallButton>}
                </div>
              )}
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

function CategoryEditor({ name, icon, color, onColor, onIcon, system = false, saving, onName, onSave, onCancel }: { name: string; icon: string; color: string; onColor: (value: string) => void; onIcon: (value: string) => void; system?: boolean; saving: boolean; onName: (value: string) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <li className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg border border-[#25415d] bg-[#0a1725] p-2.5">
      <input disabled={system || saving} className="editor-control" value={name} maxLength={100} placeholder="Название категории" aria-label="Название категории" onChange={(event) => onName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); }} />
      <SmallButton label="Сохранить категорию" disabled={saving} onClick={onSave}><Check className="size-3.5" /></SmallButton>
      <SmallButton label="Отменить" disabled={saving} onClick={onCancel}><X className="size-3.5" /></SmallButton>
      <IconPicker value={icon} color={color} onChange={onIcon} disabled={saving} />
      <ColorPicker value={color} onChange={onColor} disabled={saving} />
    </li>
  );
}

function AccountsCard({ accounts, onChanged }: { accounts: Account[]; onChanged: () => Promise<void> }) {
  const ordering = useOrdering('accounts', onChanged);
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
      await requestJson<Account>(creating ? '/api/accounts' : `/api/accounts/${editingId}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), balance_cents: Math.round(amount * 100) }),
      });
      setEditingId(null);
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить счёт');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (account: Account) => {
    const note = ` Все связанные операции (${account.transaction_count}) за все месяцы будут удалены без возможности восстановления и исчезнут из статистики.`;
    if (!window.confirm(`Удалить счёт «${account.name}»?${note}`)) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson<void>(`/api/accounts/${account.id}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('finance-data-updated'));
      if (editingId === account.id) setEditingId(null);
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось удалить счёт');
    } finally {
      setSaving(false);
    }
  };

  const total = accounts.reduce((sum, account) => sum + account.balance_cents, 0);

  return (
    <article className="flex h-[32rem] min-w-0 flex-col rounded-xl border border-[#15283b] bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#76a8ef]">Счета</h2>
        <button type="button" onClick={beginCreate} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded-md border border-[#24405d] px-2 text-[13px] text-[#91b9df] transition-colors hover:bg-[#17304a] disabled:opacity-50">
          <Plus className="size-3.5" aria-hidden="true" />
          Добавить
        </button>
      </div>

      {error ? <p className="mb-3 rounded-md bg-[#2b1720] px-3 py-2 text-xs text-[#ff9ca8]">{error}</p> : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {editingId === 'new' ? (
          <AccountEditor name={name} balance={balance} saving={saving} onName={setName} onBalance={setBalance} onSave={() => void save()} onCancel={cancel} />
        ) : null}
        {accounts.length === 0 && editingId !== 'new' ? (
          <p className="rounded-lg border border-dashed border-[#25415d] px-4 py-8 text-center text-xs text-[#718398]">Добавьте первый счёт</p>
        ) : null}
        {ordering.error && <p role="alert" className="text-xs text-[#ff9ca8]">{ordering.error}</p>}
        {accounts.map((account) => editingId === account.id ? (
          <AccountEditor key={account.id} name={name} balance={balance} saving={saving} onName={setName} onBalance={setBalance} onSave={() => void save()} onCancel={cancel} />
        ) : (
          <div key={account.id} {...ordering.dragProps(account.id, saving || editingId !== null)} className={`flex items-center gap-2 rounded-lg px-1 py-1.5 ${ordering.over === account.id ? 'bg-[#17304a] ring-1 ring-[#78b4f4]' : ''}`}>
            <GripVertical className="size-3.5 shrink-0 text-[#718398]" aria-hidden="true" />
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#17253b] text-[#76a8ef]"><Landmark className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 truncate text-sm text-[#d7e0ea]" title={account.name}>{account.name}</span>
            <span className={`ml-auto shrink-0 text-sm font-medium tabular-nums ${account.balance_cents < 0 ? 'text-[#f26868]' : 'text-[#edf3f9]'}`}>{formatCurrency(account.balance_cents)}</span>
            <div className="flex shrink-0 gap-1">
              <SmallButton label={`Изменить счёт ${account.name}`} onClick={() => beginEdit(account)}><Pencil className="size-3.5" /></SmallButton>
              <SmallButton danger label={`Удалить счёт ${account.name}`} disabled={saving} onClick={() => void remove(account)}><Trash2 className="size-3.5" /></SmallButton>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#17293c] pt-5 text-sm font-semibold text-[#76a8ef]">
        <span>Общий остаток</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </article>
  );
}

function AccountEditor({ name, balance, saving, onName, onBalance, onSave, onCancel }: { name: string; balance: string; saving: boolean; onName: (value: string) => void; onBalance: (value: string) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-[#25415d] bg-[#0a1725] p-2.5">
      <input className="editor-control" value={name} maxLength={100} placeholder="Название счёта" aria-label="Название счёта" onChange={(event) => onName(event.target.value)} />
      <div className="flex gap-2">
        <input className="editor-control" type="number" step="0.01" value={balance} aria-label="Текущий остаток" onChange={(event) => onBalance(event.target.value)} />
        <SmallButton label="Сохранить счёт" disabled={saving} onClick={onSave}><Check className="size-3.5" /></SmallButton>
        <SmallButton label="Отменить" disabled={saving} onClick={onCancel}><X className="size-3.5" /></SmallButton>
      </div>
    </div>
  );
}

function useOrdering(resource: 'categories' | 'accounts', onChanged: () => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const move = async (id: number, target: number) => {
    setPending(true);
    setError(null);
    try {
      await requestJson<void>(`/api/${resource}/${id}/place?target_id=${target}`, { method: 'POST' });
      await onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось изменить порядок');
    } finally { setPending(false); }
  };
  const dragProps = (id: number, disabled: boolean): React.HTMLAttributes<HTMLElement> => ({
    draggable: !disabled && !pending,
    title: 'Зажмите левую кнопку мыши и перетащите строку',
    style: { cursor: disabled || pending ? 'default' : 'grab', opacity: dragged === id ? 0.5 : 1 },
    onDragStart: (event) => {
      if (disabled || pending || (event.target as HTMLElement).closest('button, input')) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(id));
      setDragged(id);
    },
    onDragOver: (event) => {
      if (dragged === null || disabled || pending) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOver(id);
    },
    onDrop: (event) => {
      event.preventDefault();
      if (!disabled && !pending && dragged !== null && dragged !== id) void move(dragged, id);
      setDragged(null); setOver(null);
    },
    onDragEnd: () => { setDragged(null); setOver(null); },
  });
  return { pending, error, over, dragProps };
}

function SmallButton({ label, danger = false, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button {...props} type="button" aria-label={label} title={label} className={`inline-grid size-7 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-50 ${danger ? 'border-[#49303a] text-[#d8949e] hover:bg-[#2b1720]' : 'border-[#24405d] text-[#91b9df] hover:bg-[#17304a]'}`}>
      {children}
    </button>
  );
}
