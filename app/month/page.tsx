import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const expenses = [
  ['01.05.2024', '1 200 ₽', 'Продукты', 'Покупка в магазине', 'Карта'],
  ['02.05.2024', '500 ₽', 'Транспорт', 'Метро', 'Карта'],
  ['03.05.2024', '15 000 ₽', 'Жилье', 'Аренда квартиры', 'Банк'],
  ['04.05.2024', '6 700 ₽', 'Развлечения', 'Поход в кино', 'Карта'],
  ['05.05.2024', '450 ₽', 'Продукты', 'Супермаркет', 'Карта'],
];

const incomes = [
  ['01.05.2024', '120 000 ₽', 'Зарплата', 'Апрель', 'Банк'],
  ['10.05.2024', '10 000 ₽', 'Фриланс', 'Проект', 'Карта'],
  ['15.05.2024', '15 000 ₽', 'Инвестиции', 'Дивиденды', 'Брокер'],
  ['20.05.2024', '5 000 ₽', 'Другое', 'Кэшбэк', 'Банк'],
];

function TransactionsTable({
  title,
  rows,
  totalLabel,
  total,
  tone,
}: {
  title: string;
  rows: string[][];
  totalLabel: string;
  total: string;
  tone: 'expense' | 'income';
}) {
  const toneClass = tone === 'expense' ? 'text-[#f26868]' : 'text-[#63c978]';

  return (
    <section className="rounded-xl border border-[#15283b] bg-card p-4 sm:p-5">
      <h2 className={`mb-3 text-sm font-semibold ${toneClass}`}>{title}</h2>
      <Table className="min-w-[720px] text-[12px]">
        <TableHeader>
          <TableRow className="border-[#17293c] hover:bg-transparent">
            {['Дата', 'Сумма', 'Категория', 'Комментарий', 'Источник'].map((heading) => (
              <TableHead key={heading} className="h-8 px-2 text-[11px] font-medium text-[#91a0b1]">
                {heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row[0]}-${row[2]}`} className="border-[#142638] hover:bg-[#112033]">
              {row.map((cell, index) => (
                <TableCell
                  key={`${cell}-${index}`}
                  className={`h-8 px-2 py-1.5 ${index === 1 ? 'font-medium tabular-nums text-[#edf3f9]' : 'text-[#bcc8d5]'}`}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className={`mt-3 flex items-center justify-between border-t border-[#17293c] px-2 pt-4 text-xs font-semibold ${toneClass}`}>
        <span>{totalLabel}</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </section>
  );
}

export default function MonthPage() {
  return (
    <div className="space-y-5">
      <TransactionsTable
        title="Расходы"
        rows={expenses}
        totalLabel="Итого расходов"
        total="63 180 ₽"
        tone="expense"
      />
      <TransactionsTable
        title="Доходы"
        rows={incomes}
        totalLabel="Итого доходов"
        total="155 000 ₽"
        tone="income"
      />
    </div>
  );
}
