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

const expenses = [
  { label: 'Продукты', amount: '25 430 ₽', icon: ShoppingBasket, color: '#f0647d', background: '#2b1b2b' },
  { label: 'Транспорт', amount: '6 120 ₽', icon: Bus, color: '#76a8ef', background: '#17253b' },
  { label: 'Жилье', amount: '15 000 ₽', icon: House, color: '#d785ee', background: '#281d37' },
  { label: 'Развлечения', amount: '6 700 ₽', icon: Gamepad2, color: '#ee7f89', background: '#2a1d2a' },
  { label: 'Здоровье', amount: '4 250 ₽', icon: HeartPulse, color: '#efa56f', background: '#2a241d' },
  { label: 'Другое', amount: '3 600 ₽', icon: MoreHorizontal, color: '#e9bd65', background: '#29261d' },
];

const incomes = [
  { label: 'Зарплата', amount: '120 000 ₽', icon: BriefcaseBusiness },
  { label: 'Фриланс', amount: '20 000 ₽', icon: Palette },
  { label: 'Инвестиции', amount: '10 000 ₽', icon: TrendingUp },
  { label: 'Другое', amount: '5 000 ₽', icon: MoreHorizontal },
];

export default function StatisticsPage() {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-xl border border-[#15283b] bg-card p-5 sm:p-6">
        <h2 className="mb-5 text-sm font-semibold text-[#f26868]">Категории расходов</h2>
        <ul className="space-y-2.5">
          {expenses.map(({ label, amount, icon: Icon, color, background }) => (
            <li key={label} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ color, background }}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm text-[#d7e0ea]">{label}</span>
              <span className="ml-auto text-sm font-medium tabular-nums text-[#edf3f9]">{amount}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between border-t border-[#17293c] pt-5 text-sm font-semibold text-[#f26868]">
          <span>Итого расходов</span>
          <span className="tabular-nums">63 180 ₽</span>
        </div>
      </article>

      <article className="rounded-xl border border-[#15283b] bg-card p-5 sm:p-6">
        <h2 className="mb-5 text-sm font-semibold text-[#63c978]">Категории доходов</h2>
        <ul className="space-y-2.5">
          {incomes.map(({ label, amount, icon: Icon }) => (
            <li key={label} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#173027] text-[#71d28a]">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm text-[#d7e0ea]">{label}</span>
              <span className="ml-auto text-sm font-medium tabular-nums text-[#edf3f9]">{amount}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between border-t border-[#17293c] pt-5 text-sm font-semibold text-[#63c978]">
          <span>Итого доходов</span>
          <span className="tabular-nums">155 000 ₽</span>
        </div>
      </article>
    </section>
  );
}
