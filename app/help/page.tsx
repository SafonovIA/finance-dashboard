'use client';

import { useState, type SyntheticEvent } from 'react';
import Image from 'next/image';
import { requestJson } from '@/lib/api';

const guide = [
  {
    title: '1. Загрузите операции',
    image: '/help-upload.svg',
    alt: 'Схема области выбора Excel-файла',
    link: '/upload',
    linkLabel: 'Открыть загрузку файла',
    description: 'Откройте «Загрузка файла» и выберите Excel-файл .xlsx или .xls. Приложение проверит строки и покажет, сколько операций добавлено, исключено и найдено повторов.',
  },
  {
    title: '2. Проверьте месяц',
    image: '/help-month.svg',
    alt: 'Схема таблицы операций за месяц с выбранной категорией',
    link: '/month',
    linkLabel: 'Открыть месяц',
    description: 'Выберите месяц в верхней части страницы. Нажмите на поле операции, чтобы изменить дату, сумму, категорию, комментарий или счёт. Изменения сохраняются при выходе из строки; таблицы можно сортировать и фильтровать.',
  },
  {
    title: '3. Посмотрите статистику',
    image: '/help-statistics.svg',
    alt: 'Схема таблиц и диаграмм расходов и доходов',
    link: '/',
    linkLabel: 'Открыть статистику',
    description: 'На вкладке «Статистика» выберите год и месяц или «За год». Суммы по категориям и диаграммы обновляются по вашим операциям. Здесь же можно управлять категориями и счетами.',
  },
];

export default function HelpPage() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length < 10) {
      setError('Напишите хотя бы 10 символов.');
      return;
    }
    setSending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await requestJson<{ message: string }>('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      setNotice(result.message);
      setText('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#15283b] bg-card p-6">
        <h2 className="text-lg font-semibold text-[#edf4fb]">Как пользоваться приложением</h2>
        <p className="mt-2 text-sm text-[#91a2b5]">Три шага от Excel-файла до отчёта. Иллюстрации показывают расположение основных элементов.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {guide.map((step) => (
          <section key={step.title} className="overflow-hidden rounded-xl border border-[#15283b] bg-card">
            <Image src={step.image} alt={step.alt} width={640} height={300} unoptimized className="aspect-[640/300] w-full object-cover" />
            <div className="space-y-3 p-5">
              <h3 className="text-base font-semibold text-[#e9f1f8]">{step.title}</h3>
              <p className="text-sm leading-6 text-[#a4b3c2]">{step.description}</p>
              <a href={step.link} className="inline-block text-sm font-medium text-[#82bdf5] hover:text-[#afd7ff]">{step.linkLabel} →</a>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-[#15283b] bg-card p-6">
        <h2 className="text-base font-semibold text-[#e9f1f8]">Дополнительно</h2>
        <p className="mt-2 text-sm leading-6 text-[#a4b3c2]">В <a href="/settings" className="text-[#82bdf5] hover:text-[#afd7ff]">настройках</a> можно изменить размер интерфейса, email и пароль. Данные и настройки каждого пользователя хранятся отдельно.</p>
      </section>

      <section className="rounded-xl border border-[#15283b] bg-card p-6">
        <h2 className="text-lg font-semibold text-[#edf4fb]">Обратная связь</h2>
        <p className="mt-2 text-sm text-[#91a2b5]">Опишите вопрос или проблему. Сообщение и адрес вашего аккаунта будут отправлены на safonov.gosha2016@yandex.ru.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-5 max-w-2xl space-y-3">
          <label htmlFor="feedback-text" className="block text-sm font-medium text-[#dce7f2]">Ваше сообщение</label>
          <textarea
            id="feedback-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            minLength={10}
            maxLength={4000}
            required
            rows={6}
            placeholder="Напишите, что нужно улучшить или что не работает..."
            className="w-full resize-y rounded-lg border border-[#25415c] bg-[#0a1929] px-4 py-3 text-sm text-[#e8f1fa] outline-none placeholder:text-[#6d8094] focus:border-[#67a4d9]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#7f93a8]">{text.length} / 4000 символов · не чаще одного сообщения в минуту</span>
            <button type="submit" disabled={sending || text.trim().length < 10} className="rounded-lg bg-[#2863a5] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3479bd] disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? 'Отправляем...' : 'Отправить сообщение'}
            </button>
          </div>
          {notice && <output className="block text-sm text-[#80d7a2]">{notice}</output>}
          {error && <p role="alert" className="text-sm text-[#f39ba8]">{error}</p>}
        </form>
      </section>
    </div>
  );
}
