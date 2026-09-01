'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useMonth } from '@/components/month-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, requestJson, type Transaction, type TransactionType } from '@/lib/api';

const categories = {
  expense: ['Продукты', 'Транспорт', 'Жилье', 'Развлечения', 'Здоровье', 'Другое'],
  income: ['Зарплата', 'Фриланс', 'Инвестиции', 'Другое'],
};

type EditValues = {
  occurred_on: string;
  amount: string;
  category: string;
  comment: string;
  source: string;
};

export default function MonthPage() {
  const { selectedMonth, loading: monthsLoading } = useMonth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!selectedMonth) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setTransactions(await requestJson<Transaction[]>(`/api/transactions?month=${selectedMonth}`));
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

  if (monthsLoading || loading) return <div className="h-[420px] animate-pulse rounded-xl border border-[#15283b] bg-card" />;
  if (error) return <p className="rounded-lg border border-[#5b2a32] bg-[#25151d] p-4 text-sm text-[#ff9ca8]">{error}</p>;
  if (!selectedMonth) {
    return <p className="rounded-xl border border-dashed border-[#25415d] bg-[#0a1725] px-6 py-16 text-center text-sm text-[#91a2b5]">Загрузите Excel-файл, чтобы увидеть операции за месяц.</p>;
  }

  return (
    <div className="space-y-5">
      <TransactionsTable title="Расходы" rows={expenses} tone="expense" onUpdated={handleUpdated} />
      <TransactionsTable title="Доходы" rows={incomes} tone="income" onUpdated={handleUpdated} />
    </div>
  );
}

function TransactionsTable({
  title,
  rows,
  tone,
  onUpdated,
}: {
  title: string;
  rows: Transaction[];
  tone: TransactionType;
  onUpdated: (transaction: Transaction) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [values, setValues] = useState<EditValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toneClass = tone === 'expense' ? 'text-[#f26868]' : 'text-[#63c978]';
  const total = rows.reduce(
    (sum, transaction) => sum + (transaction.kind === 'refund' ? -transaction.amount_cents : transaction.amount_cents),
    0,
  );

  const startEditing = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setValues({
      occurred_on: transaction.occurred_on,
      amount: (transaction.amount_cents / 100).toFixed(2),
      category: transaction.category,
      comment: transaction.comment ?? '',
      source: transaction.source,
    });
    setError(null);
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
      const updated = await requestJson<Transaction>(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurred_on: values.occurred_on,
          amount_cents: Math.round(amount * 100),
          category: values.category,
          comment: values.comment || null,
          source: values.source,
        }),
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

  return (
    <section className="rounded-xl border border-[#15283b] bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={`text-sm font-semibold ${toneClass}`}>{title}</h2>
        <span className="text-[11px] text-[#718398]">Нажмите на карандаш, чтобы изменить строку</span>
      </div>
      {error ? <p className="mb-3 rounded-md bg-[#2b1720] px-3 py-2 text-xs text-[#ff9ca8]">{error}</p> : null}
      <Table className="min-w-[900px] text-[12px]">
        <TableHeader>
          <TableRow className="border-[#17293c] hover:bg-transparent">
            {['Дата', 'Сумма', 'Категория', 'Комментарий', 'Источник', ''].map((heading) => (
              <TableHead key={heading || 'actions'} className="h-8 px-2 text-[11px] font-medium text-[#91a0b1]">{heading}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="border-[#142638] hover:bg-transparent">
              <TableCell colSpan={6} className="h-20 text-center text-[#718398]">Операций нет</TableCell>
            </TableRow>
          ) : null}
          {rows.map((transaction) => {
            const editing = editingId === transaction.id && values;
            return (
              <TableRow key={transaction.id} className="border-[#142638] hover:bg-[#112033]">
                <TableCell className="h-10 px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? <EditorInput type="date" value={values.occurred_on} onChange={(value) => setValues({ ...values, occurred_on: value })} /> : formatDate(transaction.occurred_on)}
                </TableCell>
                <TableCell className="h-10 px-2 py-1.5 font-medium tabular-nums text-[#edf3f9]">
                  {editing ? <EditorInput type="number" step="0.01" min="0.01" value={values.amount} onChange={(value) => setValues({ ...values, amount: value })} /> : `${transaction.kind === 'refund' ? '−' : ''}${formatCurrency(transaction.amount_cents)}`}
                </TableCell>
                <TableCell className="h-10 px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? (
                    <select className="editor-control" value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })}>
                      {categories[tone].map((category) => <option key={category}>{category}</option>)}
                    </select>
                  ) : transaction.category}
                </TableCell>
                <TableCell className="h-10 max-w-[260px] px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? <EditorInput value={values.comment} onChange={(value) => setValues({ ...values, comment: value })} /> : (transaction.comment ?? '—')}
                </TableCell>
                <TableCell className="h-10 max-w-[180px] px-2 py-1.5 text-[#bcc8d5]">
                  {editing ? <EditorInput value={values.source} onChange={(value) => setValues({ ...values, source: value })} /> : transaction.source}
                </TableCell>
                <TableCell className="h-10 w-20 px-2 py-1.5 text-right">
                  {editing ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Сохранить" disabled={saving} onClick={() => void save(transaction)}><Check className="size-3.5" /></IconButton>
                      <IconButton label="Отменить" disabled={saving} onClick={() => { setEditingId(null); setValues(null); setError(null); }}><X className="size-3.5" /></IconButton>
                    </div>
                  ) : (
                    <IconButton label="Изменить" onClick={() => startEditing(transaction)}><Pencil className="size-3.5" /></IconButton>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className={`mt-3 flex items-center justify-between border-t border-[#17293c] px-2 pt-4 text-xs font-semibold ${toneClass}`}>
        <span>{tone === 'expense' ? 'Итого расходов' : 'Итого доходов'}</span>
        <span className="tabular-nums">{formatCurrency(Math.max(0, total))}</span>
      </div>
    </section>
  );
}

function EditorInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }) {
  return <input {...props} className="editor-control" value={value} onChange={(event) => onChange(event.target.value)} />;
}

function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} type="button" aria-label={label} title={label} className="inline-grid size-7 place-items-center rounded-md border border-[#24405d] text-[#91b9df] transition-colors hover:bg-[#17304a] disabled:opacity-50">{children}</button>;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}
