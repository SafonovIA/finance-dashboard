'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useInterfaceSettings, type InterfaceSize } from '@/components/interface-settings';
import { requestJson } from '@/lib/api';

const sizes: { value: InterfaceSize; label: string; description: string }[] = [
  { value: 'small', label: 'Маленький', description: 'Исходный размер · 100%' },
  { value: 'medium', label: 'Средний', description: 'Крупнее на 15% · 115%' },
  { value: 'large', label: 'Большой', description: 'Крупнее на 30% · 130%' },
];

export default function SettingsPage() {
  const { size, setSize } = useInterfaceSettings();
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void requestJson<{ email: string | null }>('/api/auth/profile').then((profile) => {
      setEmail(profile.email ?? '');
      setSavedEmail(profile.email);
    }).catch(() => setMessage('Не удалось загрузить email'));
  }, []);
  const saveEmail = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const profile = await requestJson<{ email: string }>('/api/auth/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      setEmail(profile.email);
      setSavedEmail(profile.email);
      setMessage('Email сохранён');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить email');
    } finally { setSaving(false); }
  };
  return <div className="space-y-5"><section className="rounded-xl border border-[#15283b] bg-card p-6">
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
  </section><section className="rounded-xl border border-[#15283b] bg-card p-6">
    <h2 className="text-base font-semibold">Аккаунт</h2>
    <p className="my-3 text-sm text-[#91a2b5]">{savedEmail ? 'Email для входа' : 'Привяжите email, чтобы входить по нему вместо прежнего имени.'}</p>
    <form onSubmit={(event) => void saveEmail(event)} className="flex max-w-lg flex-wrap gap-2">
      <input type="email" required maxLength={255} autoComplete="email" aria-label="Email аккаунта" value={email} onChange={(event) => setEmail(event.target.value)} className="editor-control flex-1" />
      <button type="submit" disabled={saving} className="rounded-lg bg-[#2863a5] px-4 text-sm text-white disabled:opacity-50">Сохранить</button>
    </form>
    {message && <output className="mt-3 block text-sm text-[#91b9df]">{message}</output>}
  </section></div>;
}
