'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { requestJson } from '@/lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const linkToken = new URLSearchParams(window.location.search).get('token') ?? '';
    const timer = window.setTimeout(() => setToken(linkToken), 0);
    window.history.replaceState(null, '', '/reset-password');
    return () => window.clearTimeout(timer);
  }, []);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) { setError('Пароли не совпадают'); return; }
    setBusy(true); setError(null);
    try {
      await requestJson('/api/auth/password/reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, new_password: password }),
      });
      setDone(true); setToken(''); setPassword(''); setConfirmation('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось изменить пароль');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center p-5"><form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-5 rounded-xl border border-[#25415d] bg-card p-7 shadow-xl">
    <h1 className="text-xl font-semibold">Новый пароль</h1>
    {token && !done ? <>
      <label className="block text-sm">Новый пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="editor-control mt-2" /></label>
      <label className="block text-sm">Повторите пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="editor-control mt-2" /></label>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#2863a5] px-4 py-2.5 text-sm text-white disabled:opacity-50">{busy ? 'Подождите…' : 'Сохранить пароль'}</button>
    </> : <p className="text-sm text-[#91a2b5]">{done ? 'Пароль изменён. Войдите с новым паролем.' : 'Ссылка отсутствует. Запросите восстановление на странице входа.'}</p>}
    {error && <p role="alert" className="text-sm text-[#ff9ca8]">{error}</p>}
    <Link href="/login" className="block text-center text-sm text-[#91b9df]">Перейти ко входу</Link>
  </form></main>;
}
