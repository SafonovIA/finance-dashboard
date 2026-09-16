'use client';

import { useInterfaceSettings, type InterfaceSize } from '@/components/interface-settings';

const sizes: { value: InterfaceSize; label: string; description: string }[] = [
  { value: 'small', label: 'Маленький', description: 'Исходный размер · 100%' },
  { value: 'medium', label: 'Средний', description: 'Крупнее на 15% · 115%' },
  { value: 'large', label: 'Большой', description: 'Крупнее на 30% · 130%' },
];

export default function SettingsPage() {
  const { size, setSize } = useInterfaceSettings();
  return <section className="rounded-xl border border-[#15283b] bg-card p-6">
    <fieldset>
      <legend className="text-base font-semibold">Размер таблиц и текста</legend>
      <p className="my-3 text-sm text-[#91a2b5]">Размер применяется ко всему приложению и сохраняется в этом браузере.</p>
      <div className="flex flex-wrap gap-3">{sizes.map((option) => (
        <label key={option.value} aria-label={option.label} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${size === option.value ? 'border-[#78b4f4] bg-[#17304a]' : 'border-[#24405d]'}`}>
          <input type="radio" name="interface-size" value={option.value} checked={size === option.value} onChange={() => setSize(option.value)} className="accent-[#78b4f4]" />
          <span><span className="block text-sm font-medium">{option.label}</span><span className="text-xs text-[#91a2b5]">{option.description}</span></span>
        </label>
      ))}</div>
    </fieldset>
  </section>;
}
