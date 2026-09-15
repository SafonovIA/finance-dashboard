'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import { ArrowUpDown, Check, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { CategoryIcon, CategorySelect } from '@/components/category-icon';
import { useMonth } from '@/components/month-context';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, requestJson, type Account, type Categories, type Category, type MonthDeleteResult, type Transaction, type TransactionType } from '@/lib/api';

const emptyCategories: Categories = { expense: [], income: [] };

type EditValues = {
  occurred_on: string;
  amount: string;
  category: string;
  comment: string;
  account_id: string;
};

type SortKey = 'occurred_on' | 'amount_cents' | 'category' | 'comment' | 'source';
type SortDirection = 'asc' | 'desc';

const tableColumns: { key: SortKey; label: string }[] = [
  { key: 'occurred_on', label: 'Дата' },
  { key: 'amount_cents', label: 'Сумма' },
  { key: 'category', label: 'Категория' },
  { key: 'comment', label: 'Комментарий' },
  { key: 'source', label: 'Источник' },
];

const textCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

export default function MonthPage() {
  const { selectedMonth, loading: monthsLoading } = useMonth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Categories>(emptyCategories);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingMonth, setDeletingMonth] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!selectedMonth) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setError(null);
    setDeleteError(null);
    setNotice(null);
    try {
      const [transactionRows, accountRows, categoryRows] = await Promise.all([
        requestJson<Transaction[]>(`/api/transactions?month=${selectedMonth}`),
        requestJson<Account[]>('/api/accounts'),
        requestJson<Categories>('/api/categories'),
      ]);
      setTransactions(transactionRows);
      setAccounts(accountRows);
      setCategories(categoryRows);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить операции');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadTransactions(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadTransactions]);

  const expenses = useMemo(() => transactions.filter((transaction) => transaction.type === 'expense'), [transactions]);
  const incomes = useMemo(() => transactions.filter((transaction) => transaction.type === 'income'), [transactions]);

  const handleUpdated = (updated: Transaction) => {
    setTransactions((current) =>
      updated.occurred_on.slice(0, 7) === selectedMonth
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : current.filter((item) => item.id !== updated.id),
    );
    window.dispatchEvent(new Event('finance-data-updated'));
  };

  const handleDeleted = (transactionId: number) => {
    setTransactions((current) => current.filter((item) => item.id !== transactionId));
    window.dispatchEvent(new Event('finance-data-updated'));
  };

  const deleteSelectedMonth = async () => {
    if (!window.confirm(`Удалить все операции за ${selectedMonth}? Это действие нельзя отменить.`)) return;
    setDeletingMonth(true);
    setDeleteError(null);
    setNotice(null);
    try {
      const result = await requestJson<MonthDeleteResult>(`/api/transactions?month=${selectedMonth}`, { method: 'DELETE' });
      setTransactions([]);
      setNotice(`Удалено операций: ${result.deleted_rows}`);
      window.dispatchEvent(new Event('finance-data-updated'));
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : 'Не удалось удалить данные месяца');
    } finally {
      setDeletingMonth(false);
    }
  };

  if (monthsLoading || loading) return <div className="h-[483px] animate-pulse rounded-xl border border-[#15283b] bg-card" />;
  if (error) return <p className="rounded-lg border border-[#5b2a32] bg-[#25151d] p-4 text-sm text-[#ff9ca8]">{error}</p>;
  if (!selectedMonth) {
    return <p className="rounded-xl border border-dashed border-[#25415d] bg-[#0a1725] px-6 py-16 text-center text-sm text-[#91a2b5]">Загрузите Excel-файл, чтобы увидеть операции за месяц.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {notice ? <output className="mr-auto text-sm text-[#75d391]">{notice}</output> : null}
        {deleteError ? <p role="alert" className="mr-auto text-sm text-[#ff9ca8]">{deleteError}</p> : null}
        <button
          type="button"
          disabled={deletingMonth}
          onClick={() => void deleteSelectedMonth()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#66313a] bg-[#25151d] px-3 text-sm font-medium text-[#ff9ca8] transition-colors hover:bg-[#321923] disabled:cursor-wait disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {deletingMonth ? 'Удаляем…' : 'Удалить данные за месяц'}
        </button>
      </div>
      <TransactionsTable key={`${selectedMonth}-expense`} title="Расходы" rows={expenses} accounts={accounts} categories={categories.expense} tone="expense" onUpdated={handleUpdated} onDeleted={handleDeleted} />
      <TransactionsTable key={`${selectedMonth}-income`} title="Доходы" rows={incomes} accounts={accounts} categories={categories.income} tone="income" onUpdated={handleUpdated} onDeleted={handleDeleted} />
    </div>
  );
}

function TransactionsTable({
  title,
  rows,
  accounts,
  categories,
  tone,
  onUpdated,
  onDeleted,
}: {
  title: string;
  rows: Transaction[];
  accounts: Account[];
  categories: Category[];
  tone: TransactionType;
  onUpdated: (transaction: Transaction) => void;
  onDeleted: (transactionId: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [initialField, setInitialField] = useState<keyof EditValues>('occurred_on');
  const [values, setValues] = useState<EditValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('occurred_on');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dateFilter, setDateFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [commentFilter, setCommentFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const toneClass = tone === 'expense' ? 'text-[#f26868]' : 'text-[#63c978]';
  const sourceOptions = useMemo(
    () => [...new Set(rows.map((transaction) => transaction.source))].sort((left, right) => textCollator.compare(left, right)),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const commentQuery = commentFilter.trim().toLocaleLowerCase('ru');
    return rows.filter((transaction) => (
      (!dateFilter || transaction.occurred_on === dateFilter)
      && (!categoryFilter || transaction.category === categoryFilter)
      && (!sourceFilter || transaction.source === sourceFilter)
      && (!commentQuery || (transaction.comment ?? '').toLocaleLowerCase('ru').includes(commentQuery))
    ));
  }, [categoryFilter, commentFilter, dateFilter, rows, sourceFilter]);
  const total = filteredRows.reduce(
    (sum, transaction) => sum + (transaction.kind === 'refund' ? -transaction.amount_cents : transaction.amount_cents),
    0,
  );
  const sortedRows = useMemo(() => [...filteredRows].sort((left, right) => {
    let comparison: number;
    if (sortKey === 'amount_cents') {
      const leftAmount = left.kind === 'refund' ? -left.amount_cents : left.amount_cents;
      const rightAmount = right.kind === 'refund' ? -right.amount_cents : right.amount_cents;
      comparison = leftAmount - rightAmount;
    } else if (sortKey === 'occurred_on') {
      comparison = left.occurred_on.localeCompare(right.occurred_on);
    } else {
      comparison = textCollator.compare(left[sortKey] ?? '', right[sortKey] ?? '');
    }
    if (comparison === 0) return left.id - right.id;
    return sortDirection === 'asc' ? comparison : -comparison;
  }), [filteredRows, sortDirection, sortKey]);
  const hasActiveFilters = Boolean(dateFilter || categoryFilter || commentFilter.trim() || sourceFilter);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const clearFilters = () => {
    setDateFilter('');
    setCategoryFilter('');
    setCommentFilter('');
    setSourceFilter('');
  };

  const startEditing = (transaction: Transaction, field: keyof EditValues) => {
    if (saving) return;
    if (editingId !== null && editingId !== transaction.id && !window.confirm('Отменить несохранённые изменения строки?')) return;
    flushSync(() => {
    setInitialField(field);
    setEditingId(transaction.id);
    setValues({
      occurred_on: transaction.occurred_on,
      amount: (transaction.amount_cents / 100).toFixed(2),
      category: transaction.category,
      comment: transaction.comment ?? '',
      account_id: String(transaction.account_id),
    });
    setError(null);
    });
    const row = document.getElementById(`transaction-${transaction.id}`);
    const column = ['occurred_on', 'amount', 'category', 'comment', 'account_id'].indexOf(field);
    const input = row?.querySelectorAll('td')[column]?.querySelector('input');
    if (input) {
      input.focus();
      if (field === 'comment') input.select();
      if (field === 'occurred_on') { try { input.showPicker(); } catch { /* Keyboard editing remains available. */ } }
    }
  };

  const save = async (transaction: Transaction) => {
    if (!values) return;
    const amount = Number(values.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const changes: Record<string, unknown> = {};
      if (values.occurred_on !== transaction.occurred_on) changes.occurred_on = values.occurred_on;
      if (Math.round(amount * 100) !== transaction.amount_cents) changes.amount_cents = Math.round(amount * 100);
      if (values.category !== transaction.category) changes.category = values.category;
      if ((values.comment || null) !== transaction.comment) changes.comment = values.comment || null;
      if (Number(values.account_id) !== transaction.account_id) changes.account_id = Number(values.account_id);
      if (!Object.keys(changes).length) { setEditingId(null); setValues(null); return; }
      const updated = await requestJson<Transaction>(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      onUpdated(updated);
      setEditingId(null);
      setValues(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (transaction: Transaction) => {
    if (!window.confirm('Удалить эту операцию? Она исчезнет из статистики.')) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson<void>(`/api/transactions/${transaction.id}`, { method: 'DELETE' });
      if (editingId === transaction.id) {
        setEditingId(null);
        setValues(null);
      }
      onDeleted(transaction.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось удалить операцию');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#15283b] bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={`text-sm font-semibold ${toneClass}`}>{title}</h2>
        <span className="text-[13px] text-[#718398]">Показано {filteredRows.length} из {rows.length} · нажмите поле для изменения, ✓ для сохранения</span>
      </div>
      {error ? <p className="mb-3 rounded-md bg-[#2b1720] px-3 py-2 text-xs text-[#ff9ca8]">{error}</p> : null}
      <Table className="month-table min-w-[1035px] table-fixed text-[14px]">
        <colgroup>
          <col style={{ width: '17%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <TableHeader>
          <TableRow className="border-[#17293c] hover:bg-transparent">
            {tableColumns.map((column) => {
              const active = sortKey === column.key;
              const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <TableHead key={column.key} aria-sort={ariaSort} className="h-8 px-2 text-[13px] font-medium text-[#91a0b1]">
                  <button type="button" onClick={() => changeSort(column.key)} className="inline-flex items-center gap-1.5 rounded px-1 py-1 transition-colors hover:bg-[#17304a] hover:text-[#d9e7f5]" title={`Сортировать по столбцу «${column.label}»`}>
                    {column.label}
                    <SortIcon active={active} direction={sortDirection} />
                  </button>
                </TableHead>
              );
            })}
            <TableHead className="h-8 px-2 text-[13px] font-medium text-[#91a0b1]"><span className="sr-only">Действия</span></TableHead>
          </TableRow>
          <TableRow className="border-[#17293c] bg-[#0a1725] hover:bg-[#0a1725]">
            <TableHead className="h-auto px-2 py-2">
              <label className="sr-only" htmlFor={`${tone}-date-filter`}>Фильтр по дате</label>
              <Input id={`${tone}-date-filter`} type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="h-8 min-w-[10rem] border-[#24405d] bg-[#091522] px-2 text-xs text-[#bcc8d5]" />
            </TableHead>
            <TableHead className="h-auto px-2 py-2"><span className="sr-only">Фильтр по сумме не задан</span></TableHead>
            <TableHead className="h-auto px-2 py-2">
              <label className="sr-only" htmlFor={`${tone}-category-filter`}>Фильтр по категории</label>
              <CategorySelect categories={categories} value={categoryFilter} onChange={setCategoryFilter} all label="Фильтр по категории" />
            </TableHead>
            <TableHead className="h-auto px-2 py-2">
              <label className="sr-only" htmlFor={`${tone}-comment-filter`}>Фильтр по комментарию</label>
              <Input id={`${tone}-comment-filter`} type="search" value={commentFilter} onChange={(event) => setCommentFilter(event.target.value)} placeholder="Найти комментарий" className="h-8 min-w-[13rem] border-[#24405d] bg-[#091522] px-2 text-xs text-[#bcc8d5]" />
            </TableHead>
            <TableHead className="h-auto px-2 py-2">
              <label className="sr-only" htmlFor={`${tone}-source-filter`}>Фильтр по источнику</label>
              <select id={`${tone}-source-filter`} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="h-8 w-full min-w-[10rem] rounded-lg border border-[#24405d] bg-[#091522] px-2 text-xs text-[#bcc8d5] outline-none focus:border-[#4389d8]">
                <option value="">Все источники</option>
                {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </TableHead>
            <TableHead className="h-auto px-2 py-2 text-right">
              <IconButton label="Сбросить фильтры" disabled={!hasActiveFilters} onClick={clearFilters}><X className="size-3.5" /></IconButton>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.length === 0 ? (
            <TableRow className="border-[#142638] hover:bg-transparent">
              <TableCell colSpan={6} className="h-20 text-center text-[#718398]">{rows.length === 0 ? 'Операций нет' : 'По выбранным фильтрам операций нет'}</TableCell>
            </TableRow>
          ) : null}
          {sortedRows.map((transaction) => {
            const editing = editingId === transaction.id && values;
            return (
              <TableRow id={`transaction-${transaction.id}`} key={transaction.id} className="border-[#142638] hover:bg-[#112033]">
                <TableCell className="h-10 px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? <EditorInput aria-label="Дата" type="date" value={values.occurred_on} onChange={(value) => setValues({ ...values, occurred_on: value })} /> : <FieldButton label="Изменить дату" onClick={() => startEditing(transaction, 'occurred_on')}>{formatDate(transaction.occurred_on)}</FieldButton>}
                </TableCell>
                <TableCell className="h-10 px-2 py-1.5 font-medium tabular-nums text-[#edf3f9]">
                  {editing ? <EditorInput aria-label="Сумма" type="number" step="0.01" min="0.01" value={values.amount} onChange={(value) => setValues({ ...values, amount: value })} /> : <FieldButton label="Изменить сумму" onClick={() => startEditing(transaction, 'amount')}>{`${transaction.kind === 'refund' ? '−' : ''}${formatCurrency(transaction.amount_cents)}`}</FieldButton>}
                </TableCell>
                <TableCell className="h-10 px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? (
                    <CategorySelect defaultOpen={initialField === 'category'} categories={categories} value={values.category} onChange={(category) => setValues({ ...values, category })} disabled={saving} />
                  ) : <FieldButton label="Изменить категорию" onClick={() => startEditing(transaction, 'category')}><CategoryIcon icon={categories.find((category) => category.name === transaction.category)?.icon} color={categories.find((category) => category.name === transaction.category)?.icon_color} />{transaction.category}</FieldButton>}
                </TableCell>
                <TableCell className="h-10 max-w-[299px] px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? <EditorInput aria-label="Комментарий" value={values.comment} onChange={(value) => setValues({ ...values, comment: value })} /> : <FieldButton label="Изменить комментарий" onClick={() => startEditing(transaction, 'comment')}>{transaction.comment ?? '—'}</FieldButton>}
                </TableCell>
                <TableCell className="h-10 max-w-[207px] px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? (
                    <Select defaultOpen={initialField === 'account_id'} value={values.account_id} onValueChange={(account_id) => { if (account_id !== null) setValues({ ...values, account_id }); }} disabled={saving}>
                      <SelectTrigger aria-label="Источник" className="w-full"><span className="truncate">{accounts.find((account) => String(account.id) === values.account_id)?.name}</span></SelectTrigger>
                      <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <FieldButton label="Изменить источник" onClick={() => startEditing(transaction, 'account_id')}>{transaction.source}</FieldButton>}
                </TableCell>
                <TableCell className="h-10 w-24 px-2 py-1.5 text-right">
                  {editing ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Сохранить" disabled={saving} onClick={() => void save(transaction)}><Check className="size-3.5" /></IconButton>
                      <IconButton label="Отменить" disabled={saving} onClick={() => { setEditingId(null); setValues(null); setError(null); }}><X className="size-3.5" /></IconButton>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <IconButton danger label="Удалить" disabled={saving} onClick={() => void remove(transaction)}><Trash2 className="size-3.5" /></IconButton>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className={`mt-3 flex items-center justify-between border-t border-[#17293c] px-2 pt-4 text-xs font-semibold ${toneClass}`}>
        <span>{hasActiveFilters ? 'Итого по фильтру' : (tone === 'expense' ? 'Итого расходов' : 'Итого доходов')}</span>
        <span className="tabular-nums">{formatCurrency(Math.max(0, total))}</span>
      </div>
    </section>
  );
}

function FieldButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex min-h-8 w-full items-center gap-2 rounded px-1 text-left hover:bg-[#17304a] focus-visible:outline-2 focus-visible:outline-[#78b4f4]">{children}</button>;
}

function EditorInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }) {
  return <input {...props} className="editor-control" value={value} onChange={(event) => onChange(event.target.value)} />;
}

function IconButton({ label, danger = false, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return <button {...props} type="button" aria-label={label} title={label} className={`inline-grid size-7 place-items-center rounded-md border transition-colors disabled:opacity-50 ${danger ? 'border-[#49303a] text-[#d8949e] hover:bg-[#2b1720]' : 'border-[#24405d] text-[#91b9df] hover:bg-[#17304a]'}`}>{children}</button>;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-45" aria-hidden="true" />;
  return direction === 'asc'
    ? <ChevronUp className="size-3.5 text-[#78b4f4]" aria-hidden="true" />
    : <ChevronDown className="size-3.5 text-[#78b4f4]" aria-hidden="true" />;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}
