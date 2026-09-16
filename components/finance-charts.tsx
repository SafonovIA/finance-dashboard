'use client';

import { formatCurrency, type Categories, type CategoryTotal, type Statistics } from '@/lib/api';

export function FinanceCharts({ statistics, categories }: { statistics: Statistics | null; categories: Categories }) {
  return <section aria-label="Диаграммы по категориям" className="grid gap-5 lg:grid-cols-2">
    <CategoryChart title="Расходы" rows={statistics?.expenses ?? []} colors={new Map(categories.expense.map((category) => [category.name, category.icon_color]))} fallback="#e995a3" />
    <CategoryChart title="Доходы" rows={statistics?.incomes ?? []} colors={new Map(categories.income.map((category) => [category.name, category.icon_color]))} fallback="#8fc6a4" />
  </section>;
}

function CategoryChart({ title, rows, colors, fallback }: { title: string; rows: CategoryTotal[]; colors: Map<string, string>; fallback: string }) {
  const data = rows.filter((row) => row.amount_cents > 0).sort((a, b) => b.amount_cents - a.amount_cents);
  const max = Math.max(1, ...data.map((row) => row.amount_cents));
  return <article className="flex h-[26rem] min-w-0 flex-col rounded-xl border border-[#15283b] bg-card p-6">
    <h2 className="mb-5 text-sm font-semibold" style={{ color: fallback }}>{title} по категориям</h2>
    {data.length === 0 ? <p className="my-auto text-center text-sm text-[#91a2b5]">Нет данных для диаграммы</p> : <ul className="panel-scroll min-h-0 space-y-4 overflow-y-auto">
      {data.map((row) => <li key={row.category}>
        <div className="mb-1 flex justify-between gap-3 text-xs"><span className="min-w-0 break-words">{row.category}</span><span className="shrink-0 tabular-nums">{formatCurrency(row.amount_cents)}</span></div>
        <div className="h-3 rounded bg-[#17283b]" aria-hidden="true"><div className="h-full rounded" style={{ width: `${row.amount_cents / max * 100}%`, backgroundColor: colors.get(row.category) ?? fallback }} /></div>
      </li>)}
    </ul>}
  </article>;
}
