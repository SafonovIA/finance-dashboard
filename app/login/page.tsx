'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';

type AuthStatus = { setup_required: boolean; authenticated: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [registering, setRegistering] = useState(false);
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
      setRegistering(result.setup_required);
    }).catch(() => { if (active) setError('Не удалось связаться с сервером'); });
    return () => { active = false; };
  }, [router]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestJson<{ username?: string; email?: string }>(registering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registering ? { email: username, password } : { username, password }),
      });
      router.replace('/');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось войти');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center p-5">
    <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-5 rounded-xl border border-[#25415d] bg-card p-7 shadow-xl">
      <div><h1 className="text-xl font-semibold">{registering ? 'Регистрация' : 'Вход'}</h1><p className="mt-2 text-sm text-[#91a2b5]">{registering ? 'Создайте аккаунт для своих данных.' : 'Введите email и пароль. Первый владелец может войти по прежнему имени.'}</p></div>
      <label className="block text-sm">{registering ? 'Email' : 'Email или имя пользователя'}<input type={registering ? 'email' : 'text'} autoComplete="username" required maxLength={registering ? 255 : 100} value={username} onChange={(event) => setUsername(event.target.value)} className="editor-control mt-2" /></label>
      <label className="block text-sm">Пароль<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="editor-control mt-2" /></label>
      {registering && <p className="text-xs text-[#91a2b5]">Не менее 12 символов. Сохраните пароль: восстановление по email пока не настроено.</p>}
      {error && <p role="alert" className="text-sm text-[#ff9ca8]">{error}</p>}
      <button type="submit" disabled={busy || !status} className="w-full rounded-lg bg-[#2863a5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3477bd] disabled:opacity-50">{busy ? 'Подождите…' : registering ? 'Зарегистрироваться' : 'Войти'}</button>
      <button type="button" disabled={busy} onClick={() => { setRegistering((value) => !value); setError(null); setPassword(''); }} className="w-full text-center text-sm text-[#91b9df] hover:text-white">{registering ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}</button>
    </form>
  </main>;
}
