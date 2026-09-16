'use client';

import { useEffect, useState } from 'react';
import { FinanceCharts } from '@/components/finance-charts';
import { CategoryIcon } from '@/components/category-icon';
import { formatCurrency, requestJson, type Categories, type Category, type CategoryTotal, type Statistics } from '@/lib/api';

export default function AllTimePage() {
  const [data, setData] = useState<{ statistics: Statistics; categories: Categories } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [statistics, categories] = await Promise.all([requestJson<Statistics>('/api/statistics'), requestJson<Categories>('/api/categories')]);
        if (active) { setData({ statistics, categories }); setError(null); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить статистику'); }
    };
    void load();
    window.addEventListener('finance-data-updated', load);
    return () => { active = false; window.removeEventListener('finance-data-updated', load); };
  }, []);
  if (error) return <p role="alert" className="text-sm text-[#ff9ca8]">{error}</p>;
  if (!data) return <p className="text-sm text-[#91a2b5]">Загрузка статистики…</p>;
  return <div className="space-y-5">
    <section className="grid gap-5 lg:grid-cols-2">
      <TotalsTable title="Расходы за всё время" rows={data.statistics.expenses} categories={data.categories.expense} total={data.statistics.expense_total_cents} color="#e995a3" />
      <TotalsTable title="Доходы за всё время" rows={data.statistics.incomes} categories={data.categories.income} total={data.statistics.income_total_cents} color="#8fc6a4" />
    </section>
    <FinanceCharts statistics={data.statistics} categories={data.categories} />
  </div>;
}

function TotalsTable({ title, rows, categories, total, color }: { title: string; rows: CategoryTotal[]; categories: Category[]; total: number; color: string }) {
  const sorted = [...rows].sort((a, b) => b.amount_cents - a.amount_cents || a.category.localeCompare(b.category, 'ru'));
  return <article className="flex h-[30rem] min-w-0 flex-col rounded-xl border border-[#15283b] bg-card p-6">
    <h2 className="mb-4 text-sm font-semibold" style={{ color }}>{title}</h2>
    <div className="panel-scroll min-h-0 flex-1 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-[#91a2b5]"><th className="pb-3">Категория</th><th aria-sort="descending" className="pb-3 text-right">Сумма ↓</th></tr></thead><tbody>
      {sorted.map((row) => { const category = categories.find((item) => item.name === row.category); return <tr key={row.category} className="border-t border-[#17283b]"><td className="py-2"><span className="flex items-center gap-2"><CategoryIcon icon={category?.icon} color={category?.icon_color} />{row.category}</span></td><td className="pl-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(row.amount_cents)}</td></tr>; })}
      {!sorted.length && <tr><td colSpan={2} className="py-8 text-center text-[#91a2b5]">Нет данных</td></tr>}
    </tbody></table></div>
    <div className="mt-5 flex justify-between border-t border-[#17283b] pt-4 text-sm font-semibold" style={{ color }}><span>Итого</span><span>{formatCurrency(total)}</span></div>
  </article>;
}
