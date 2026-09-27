'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';

type AuthStatus = { setup_required: boolean; authenticated: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void requestJson<AuthStatus>('/api/auth/status').then((result) => {
      if (!active) return;
      if (result.authenticated) { router.replace('/'); return; }
      setStatus(result);
    }).catch(() => { if (active) setError('Не удалось связаться с сервером'); });
    return () => { active = false; };
  }, [router]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestJson<{ username: string }>(status?.setup_required ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
      });
      router.replace('/');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось войти');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center p-5">
    <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-5 rounded-xl border border-[#25415d] bg-card p-7 shadow-xl">
      <div><h1 className="text-xl font-semibold">{status?.setup_required ? 'Создать доступ' : 'Вход'}</h1><p className="mt-2 text-sm text-[#91a2b5]">{status?.setup_required ? 'Задайте имя и пароль владельца приложения.' : 'Введите имя пользователя и пароль.'}</p></div>
      <label className="block text-sm">Имя пользователя<input autoComplete="username" required maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} className="editor-control mt-2" /></label>
      <label className="block text-sm">Пароль<input type="password" autoComplete={status?.setup_required ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="editor-control mt-2" /></label>
      {status?.setup_required && <p className="text-xs text-[#91a2b5]">Не менее 12 символов. Сохраните пароль: восстановление пока не настроено.</p>}
      {error && <p role="alert" className="text-sm text-[#ff9ca8]">{error}</p>}
      <button type="submit" disabled={busy || !status} className="w-full rounded-lg bg-[#2863a5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3477bd] disabled:opacity-50">{busy ? 'Подождите…' : status?.setup_required ? 'Создать доступ' : 'Войти'}</button>
    </form>
  </main>;
}
