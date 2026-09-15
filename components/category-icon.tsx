'use client';

import { ShoppingBasket, Bus, House, Gamepad2, HeartPulse, BriefcaseBusiness, Palette, TrendingUp, MoreHorizontal, Car, Coffee, Gift, Plane, BookOpen, PawPrint, Wallet, BottleWine, ArrowUpDown, DollarSign } from 'lucide-react';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import type { Category } from '@/lib/api';

const icons = {
  other: [MoreHorizontal, 'Другое'], basket: [ShoppingBasket, 'Продукты'], bus: [Bus, 'Транспорт'], home: [House, 'Дом'],
  game: [Gamepad2, 'Развлечения'], health: [HeartPulse, 'Здоровье'], work: [BriefcaseBusiness, 'Работа'], art: [Palette, 'Творчество'],
  growth: [TrendingUp, 'Инвестиции'], car: [Car, 'Автомобиль'], coffee: [Coffee, 'Кафе'], gift: [Gift, 'Подарки'],
  plane: [Plane, 'Путешествия'], book: [BookOpen, 'Образование'], pet: [PawPrint, 'Питомцы'], wallet: [Wallet, 'Кошелёк'],
  bottle: [BottleWine, 'Бутылка'], arrows: [ArrowUpDown, 'Стрелки вверх и вниз'], dollar: [DollarSign, 'Доллар'],
} as const;

const iconColors = [
  ['#e995a3', 'Пыльная роза'], ['#e7aa8b', 'Персиковый'],
  ['#dfc17e', 'Песочный'], ['#b8ca8a', 'Фисташковый'],
  ['#8fc6a4', 'Шалфейный'], ['#82c4c0', 'Бирюзовый'],
  ['#8cb7df', 'Небесный'], ['#9fa9dd', 'Барвинковый'],
  ['#b6a0d6', 'Лавандовый'], ['#c79bbd', 'Вересковый'],
] as const;

export function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <fieldset disabled={disabled} className="col-span-full">
    <legend className="mb-2 text-xs text-[#91a2b5]">Цвет иконки</legend>
    <div className="flex flex-wrap gap-2">{iconColors.map(([color, label]) => (
      <button key={color} type="button" aria-label={label} title={label} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)} className="grid size-8 place-items-center rounded-full border-2 border-transparent outline-offset-2 hover:border-white/50 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50 aria-pressed:border-white" style={{ backgroundColor: color }}>
        {value.toLowerCase() === color ? <span className="text-sm font-bold text-[#15283b]" aria-hidden="true">✓</span> : null}
      </button>
    ))}</div>
  </fieldset>;
}

export function CategoryIcon({ icon, color }: { icon?: string; color?: string }) {
  const [Icon] = icons[icon as keyof typeof icons] ?? icons.other;
  return <Icon className="size-4 shrink-0" style={color ? { color } : undefined} aria-hidden="true" />;
}

export function IconPicker({ value, color, onChange, disabled }: { value: string; color: string; onChange: (value: string) => void; disabled: boolean }) {
  return <fieldset disabled={disabled} className="col-span-full"><legend className="mb-2 text-xs text-[#91a2b5]">Картинка категории</legend><div className="flex flex-wrap gap-1">
    {Object.entries(icons).map(([key, [, label]]) => <button key={key} type="button" title={label} aria-label={label} aria-pressed={value === key} onClick={() => onChange(key)} className={`grid size-8 place-items-center rounded-md border ${value === key ? 'border-[#78b4f4] bg-[#17304a] text-[#78b4f4]' : 'border-[#24405d] text-[#91a2b5]'}`}><CategoryIcon icon={key} color={color} /></button>)}
  </div></fieldset>;
}

export function CategorySelect({ categories, value, onChange, all = false, disabled = false, label = 'Категория' }: { categories: Category[]; value: string; onChange: (value: string) => void; all?: boolean; disabled?: boolean; label?: string }) {
  const selected = categories.find((category) => category.name === value);
  return <Select value={value} onValueChange={(next) => { if (next !== null) onChange(next); }} disabled={disabled}>
    <SelectTrigger aria-label={label} className="w-full min-w-[10rem] border-[#24405d] bg-[#091522] text-[#bcc8d5]"><span className="flex items-center gap-2"><CategoryIcon icon={selected?.icon} color={selected?.icon_color} />{selected?.name ?? (all ? 'Все категории' : value)}</span></SelectTrigger>
    <SelectContent>{all && <SelectItem value="">Все категории</SelectItem>}{categories.map((category) => <SelectItem key={category.id} value={category.name}><CategoryIcon icon={category.icon} color={category.icon_color} />{category.name}</SelectItem>)}</SelectContent>
  </Select>;
}
