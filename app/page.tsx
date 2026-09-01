'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  Bus,
  Gamepad2,
  HeartPulse,
  House,
  MoreHorizontal,
  Palette,
  ShoppingBasket,
  TrendingUp,
} from 'lucide-react';
import { useMonth } from '@/components/month-context';
import { formatCurrency, requestJson, type CategoryTotal, type Statistics } from '@/lib/api';

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
    <div className="rounded-xl border border-dashed border-[#25415d] bg-[#0a1725] px-6 py-16 text-center">
      <p className="text-sm font-medium text-[#d8e4ef]">Статистика появится после загрузки Excel-файла</p>
      <p className="mt-2 text-xs text-[#7f91a5]">Перейдите во вкладку «Загрузка файла» и добавьте банковскую выгрузку.</p>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-label="Загрузка статистики">
      {[0, 1].map((item) => (
        <div key={item} className="h-[360px] animate-pulse rounded-xl border border-[#15283b] bg-card" />
      ))}
    </div>
  );
}

export default function StatisticsPage() {
  const { selectedMonth, loading: monthsLoading } = useMonth();
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatistics = useCallback(async () => {
    if (!selectedMonth) {
      setStatistics(null);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setStatistics(await requestJson<Statistics>(`/api/statistics?month=${selectedMonth}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadStatistics(), 0);
    const onDataUpdated = () => void loadStatistics();
    window.addEventListener('finance-data-updated', onDataUpdated);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('finance-data-updated', onDataUpdated);
    };
  }, [loadStatistics]);

  if (monthsLoading || loading) return <LoadingCards />;
  if (error) return <p className="rounded-lg border border-[#5b2a32] bg-[#25151d] p-4 text-sm text-[#ff9ca8]">{error}</p>;
  if (!selectedMonth || !statistics) return <EmptyState />;

  return (
    <section className="grid gap-5 lg:grid-cols-2">
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
