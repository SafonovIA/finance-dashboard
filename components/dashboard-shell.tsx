'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Settings,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MonthProvider, useMonth } from '@/components/month-context';
import { InterfaceSettingsProvider } from '@/components/interface-settings';

const navigation = [
  { href: '/', label: 'Статистика', icon: BarChart3 },
  { href: '/month', label: 'Месяц', icon: CalendarDays },
  { href: '/upload', label: 'Загрузка файла', icon: Upload },
];

const titles: Record<string, string> = {
  '/': 'Статистика',
  '/month': 'Месяц',
  '/upload': 'Загрузка файла',
  '/settings': 'Настройки',
};

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showMonth = pathname === '/' || pathname === '/month';
  const { months, selectedMonth, setSelectedMonth, loading } = useMonth();

  return (
    <div className="dashboard-shell bg-background text-foreground md:grid md:grid-cols-[225px_minmax(0,1fr)]">
      <aside className="dashboard-sidebar border-b border-border bg-[#091522] md:sticky md:top-0 md:flex md:flex-col md:border-r md:border-b-0">
        <div className="hidden h-[87px] shrink-0 items-center px-5 md:flex">
          <div className="grid size-9 place-items-center rounded-xl border border-[#22384f] bg-[#0d1d2d] text-[#78b4f4] shadow-[0_0_24px_rgba(67,137,216,0.12)]">
            <CircleDollarSign className="size-[21px]" aria-hidden="true" />
          </div>
        </div>

        <nav aria-label="Основная навигация" className="flex min-h-0 gap-1 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:px-3 md:py-3">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors',
                  active
                    ? 'bg-[#132943] text-[#7eb9f7]'
                    : 'text-[#a2afbe] hover:bg-[#0f2032] hover:text-[#d8e5f2]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 p-3">
          <Link
            href="/settings"
            aria-current={pathname === '/settings' ? 'page' : undefined}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-[#8999aa] transition-colors hover:bg-[#0f2032] hover:text-[#d8e5f2]"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span>Настройки</span>
          </Link>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="grid min-h-[87px] grid-cols-[1fr_auto_1fr] items-center border-b border-border px-5 sm:px-8">
          <span aria-hidden="true" />
          <h1 className="text-sm font-semibold tracking-tight text-[#f2f6fb] sm:text-base">
            {titles[pathname] ?? 'Статистика'}
          </h1>
          <div className="flex justify-end">
            {showMonth ? (
              <label className="relative text-xs text-[#8b9bad]">
                <span className="sr-only">Выберите месяц</span>
                <select
                  className="h-9 appearance-none rounded-lg border border-[#14263a] bg-[#0b1724] py-0 pr-8 pl-3 text-xs text-[#8b9bad] outline-none focus:border-[#315f8d] focus:ring-2 focus:ring-[#4389d8]/20"
                  value={selectedMonth}
                  disabled={loading || months.length === 0}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                >
                  {months.length === 0 ? <option value="">Нет данных</option> : null}
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2" aria-hidden="true" />
              </label>
            ) : null}
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1357px] p-5 sm:p-8">{children}</div>
      </main>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <InterfaceSettingsProvider><MonthProvider>
      <DashboardContent>{children}</DashboardContent>
    </MonthProvider></InterfaceSettingsProvider>
  );
}
