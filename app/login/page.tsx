'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson } from '@/lib/api';

type AuthStatus = { setup_required: boolean; authenticated: boolean };
type Mode = 'login' | 'register' | 'forgot' | 'check-email';

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void requestJson<AuthStatus>('/api/auth/status').then((result) => {
      if (!active) return;
      if (result.authenticated) { router.replace('/'); return; }
      setStatus(result);
      if (result.setup_required) setMode('register');
    }).catch(() => { if (active) setError('Не удалось связаться с сервером'); });
    return () => { active = false; };
  }, [router]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'forgot') {
        const result = await requestJson<{ message: string }>('/api/auth/password/reset/request', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: username }),
        });
        setMessage(result.message);
      } else if (mode === 'register') {
        await requestJson('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: username, password }),
        });
        setPassword('');
        setMode('check-email');
        setMessage('Письмо со ссылкой отправлено. Подтвердите email, затем войдите.');
      } else {
        await requestJson('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
        });
        router.replace('/');
        router.refresh();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось выполнить запрос');
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await requestJson<{ message: string }>('/api/auth/verification/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: username }),
      });
      setMessage(result.message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось отправить письмо');
    } finally { setBusy(false); }
  };

  const switchMode = (next: Mode) => { setMode(next); setError(null); setMessage(null); setPassword(''); };
  const title = mode === 'register' ? 'Регистрация' : mode === 'forgot' ? 'Восстановление пароля' : mode === 'check-email' ? 'Подтвердите email' : 'Вход';
  return <main className="grid min-h-screen place-items-center p-5">
    <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-5 rounded-xl border border-[#25415d] bg-card p-7 shadow-xl">
      <div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 text-sm text-[#91a2b5]">{mode === 'register' ? 'Создайте аккаунт для своих данных. Для входа нужно подтвердить email.' : mode === 'forgot' ? 'Мы отправим ссылку на подтверждённый email аккаунта.' : mode === 'check-email' ? 'Проверьте почту. Ссылка действует 24 часа.' : 'Введите email и пароль. Первый владелец может войти по прежнему имени.'}</p></div>
      {mode !== 'check-email' && <label className="block text-sm">{mode === 'login' ? 'Email или имя пользователя' : 'Email'}<input type={mode === 'login' ? 'text' : 'email'} autoComplete="username" required maxLength={mode === 'login' ? 100 : 255} value={username} onChange={(event) => setUsername(event.target.value)} className="editor-control mt-2" /></label>}
      {(mode === 'login' || mode === 'register') && <label className="block text-sm">Пароль<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="editor-control mt-2" /></label>}
      {mode === 'register' && <p className="text-xs text-[#91a2b5]">Не менее 12 символов.</p>}
      {error && <p role="alert" className="text-sm text-[#ff9ca8]">{error}</p>}
      {message && <output className="block text-sm text-[#91b9df]">{message}</output>}
      {mode !== 'check-email' && <button type="submit" disabled={busy || !status} className="w-full rounded-lg bg-[#2863a5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3477bd] disabled:opacity-50">{busy ? 'Подождите…' : mode === 'register' ? 'Зарегистрироваться' : mode === 'forgot' ? 'Отправить ссылку' : 'Войти'}</button>}
      {mode === 'check-email' && <button type="button" disabled={busy} onClick={() => void resend()} className="w-full rounded-lg bg-[#2863a5] px-4 py-2.5 text-sm text-white disabled:opacity-50">Отправить письмо повторно</button>}
      {mode === 'login' && <button type="button" onClick={() => switchMode('forgot')} className="w-full text-center text-sm text-[#91b9df]">Забыли пароль?</button>}
      <button type="button" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="w-full text-center text-sm text-[#91b9df] hover:text-white">{mode === 'login' ? 'Создать аккаунт' : 'Вернуться ко входу'}</button>
    </form>
  </main>;
}
