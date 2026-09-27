'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { requestJson } from '@/lib/api';

export default function VerifyEmailPage() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const linkToken = new URLSearchParams(window.location.search).get('token') ?? '';
    const timer = window.setTimeout(() => setToken(linkToken), 0);
    window.history.replaceState(null, '', '/verify-email');
    return () => window.clearTimeout(timer);
  }, []);

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const result = await requestJson<{ message: string }>('/api/auth/verification/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      setToken(''); setMessage(result.message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось подтвердить email');
    } finally { setBusy(false); }
  };

  return <main className="grid min-h-screen place-items-center p-5"><section className="w-full max-w-sm space-y-5 rounded-xl border border-[#25415d] bg-card p-7 shadow-xl">
    <h1 className="text-xl font-semibold">Подтверждение email</h1>
    {token ? <button type="button" disabled={busy} onClick={() => void confirm()} className="w-full rounded-lg bg-[#2863a5] px-4 py-2.5 text-sm text-white disabled:opacity-50">{busy ? 'Подождите…' : 'Подтвердить email'}</button> : !message && <p className="text-sm text-[#91a2b5]">Ссылка отсутствует. Откройте её из письма.</p>}
    {message && <output className="block text-sm text-[#91b9df]">{message}</output>}
    {error && <p role="alert" className="text-sm text-[#ff9ca8]">{error}</p>}
    <Link href="/login" className="block text-center text-sm text-[#91b9df]">Перейти ко входу</Link>
  </section></main>;
}
