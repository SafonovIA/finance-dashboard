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
  const { size, setSize, loading: sizeLoading, saving: sizeSaving, error: sizeError } = useInterfaceSettings();
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailPassword, setEmailPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  useEffect(() => {
    void requestJson<{ email: string | null; email_verified: boolean }>('/api/auth/profile').then((profile) => {
      setEmail(profile.email ?? '');
      setSavedEmail(profile.email);
      setEmailVerified(profile.email_verified);
    }).catch(() => setMessage('Не удалось загрузить email'));
  }, []);
  const saveEmail = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const profile = await requestJson<{ email: string | null; email_verified: boolean; pending_email?: string }>('/api/auth/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, current_password: emailPassword }),
      });
      setEmailPassword('');
      setSavedEmail(profile.email);
      setEmailVerified(profile.email_verified);
      setMessage(profile.pending_email ? `Письмо для подтверждения отправлено на ${profile.pending_email}. Адрес изменится после подтверждения.` : 'Этот email уже подтверждён');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить email');
    } finally { setSaving(false); }
  };
  const resendVerification = async () => {
    if (!savedEmail) return;
    setSaving(true); setMessage(null);
    try {
      const result = await requestJson<{ message: string }>('/api/auth/verification/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: savedEmail }),
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить письмо');
    } finally { setSaving(false); }
  };
  const changePassword = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setPasswordMessage('Пароли не совпадают'); return; }
    setPasswordSaving(true); setPasswordMessage(null);
    try {
      await requestJson('/api/auth/password/change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      window.location.assign('/login');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Не удалось изменить пароль');
      setPasswordSaving(false);
    }
  };
  return <div className="space-y-5"><section className="rounded-xl border border-[#15283b] bg-card p-6">
    <fieldset>
      <legend className="text-base font-semibold">Размер таблиц и текста</legend>
      <p className="my-3 text-sm text-[#91a2b5]">Размер применяется ко всему приложению и сохраняется для вашего аккаунта.</p>
      <div className="flex flex-wrap gap-3">{sizes.map((option) => (
        <label key={option.value} aria-label={option.label} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${size === option.value ? 'border-[#78b4f4] bg-[#17304a]' : 'border-[#24405d]'}`}>
          <input type="radio" name="interface-size" value={option.value} checked={size === option.value} disabled={sizeLoading || sizeSaving} onChange={() => void setSize(option.value)} className="accent-[#78b4f4]" />
          <span><span className="block text-sm font-medium">{option.label}</span><span className="text-xs text-[#91a2b5]">{option.description}</span></span>
        </label>
      ))}</div>
      {sizeError && <output className="mt-3 block text-sm text-[#f08e99]">{sizeError}</output>}
    </fieldset>
  </section><section className="rounded-xl border border-[#15283b] bg-card p-6">
    <h2 className="text-base font-semibold">Аккаунт</h2>
    <p className="my-3 text-sm text-[#91a2b5]">{savedEmail ? `Email для входа: ${emailVerified ? 'подтверждён' : 'не подтверждён'}` : 'Привяжите email, чтобы входить по нему вместо прежнего имени. Адрес начнёт действовать после подтверждения.'}</p>
    <form onSubmit={(event) => void saveEmail(event)} className="flex max-w-lg flex-col gap-2">
      <input type="email" required maxLength={255} autoComplete="email" aria-label="Email аккаунта" value={email} onChange={(event) => setEmail(event.target.value)} className="editor-control flex-1" />
      <input type="password" required autoComplete="current-password" aria-label="Текущий пароль для смены email" placeholder="Текущий пароль" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className="editor-control" />
      <button type="submit" disabled={saving} className="self-start rounded-lg bg-[#2863a5] px-4 py-2 text-sm text-white disabled:opacity-50">Отправить подтверждение</button>
    </form>
    {savedEmail && !emailVerified && <button type="button" disabled={saving} onClick={() => void resendVerification()} className="mt-3 text-sm text-[#91b9df] disabled:opacity-50">Отправить письмо повторно на текущий email</button>}
    {message && <output className="mt-3 block text-sm text-[#91b9df]">{message}</output>}
  </section><section className="rounded-xl border border-[#15283b] bg-card p-6">
    <h2 className="text-base font-semibold">Изменить пароль</h2>
    <p className="my-3 text-sm text-[#91a2b5]">После изменения потребуется войти снова на всех устройствах.</p>
    <form onSubmit={(event) => void changePassword(event)} className="flex max-w-lg flex-col gap-2">
      <input type="password" required autoComplete="current-password" aria-label="Текущий пароль" placeholder="Текущий пароль" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="editor-control" />
      <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" aria-label="Новый пароль" placeholder="Новый пароль (не менее 12 символов)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="editor-control" />
      <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" aria-label="Повторите новый пароль" placeholder="Повторите новый пароль" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="editor-control" />
      <button type="submit" disabled={passwordSaving} className="self-start rounded-lg bg-[#2863a5] px-4 py-2 text-sm text-white disabled:opacity-50">Изменить пароль</button>
    </form>
    {passwordMessage && <output className="mt-3 block text-sm text-[#f08e99]">{passwordMessage}</output>}
  </section></div>;
}
