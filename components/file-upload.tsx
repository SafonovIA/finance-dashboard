'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, LoaderCircle, UploadCloud } from 'lucide-react';
import { useMonth } from '@/components/month-context';
import { cn } from '@/lib/utils';
import { requestJson, type ImportResult } from '@/lib/api';

const acceptedExtensions = ['.xlsx', '.xls'];

export function FileUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { refreshMonths, setSelectedMonth } = useMonth();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = async (file?: File) => {
    if (!file || uploading) return;
    const lowerName = file.name.toLowerCase();
    if (!acceptedExtensions.some((extension) => lowerName.endsWith(extension))) {
      setError('Выберите файл Excel в формате .xlsx или .xls');
      return;
    }

    setFileName(file.name);
    setResult(null);
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const imported = await requestJson<ImportResult>('/api/imports/excel', {
        method: 'POST',
        body,
      });
      setResult(imported);
      await refreshMonths(imported.month);
      if (imported.month) setSelectedMonth(imported.month);
      window.dispatchEvent(new Event('finance-data-updated'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={(event) => void chooseFile(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={uploading}
        className={cn(
          'flex min-h-[334px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#2f68a2] bg-[#091727] px-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#4389d8] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait',
          dragging && 'border-[#74b6f7] bg-[#0d2035]',
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void chooseFile(event.dataTransfer.files?.[0]);
        }}
      >
        {uploading ? (
          <>
            <LoaderCircle className="mb-4 size-12 animate-spin text-[#77b8f4]" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-sm font-medium text-[#edf4fb]">Обрабатываем {fileName}</span>
            <span className="mt-1 text-xs text-[#8292a7]">Проверяем строки и распределяем операции</span>
          </>
        ) : fileName ? (
          <>
            <FileSpreadsheet className="mb-4 size-12 text-[#77b8f4]" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-sm font-medium text-[#edf4fb]">{fileName}</span>
            <span className="mt-1 text-xs text-[#8292a7]">Нажмите, чтобы выбрать другой файл</span>
          </>
        ) : (
          <>
            <UploadCloud className="mb-4 size-14 text-[#77b8f4]" strokeWidth={1.35} aria-hidden="true" />
            <span className="text-sm font-medium text-[#e9f1f8]">Перетащите файл сюда</span>
            <span className="mt-1 text-xs text-[#8292a7]">или нажмите для выбора</span>
          </>
        )}
        <span className="mt-5 text-[13px] text-[#607187]">Excel (.xlsx, .xls), до 15 МБ</span>
      </button>

      {error ? <p role="alert" className="rounded-lg border border-[#5b2a32] bg-[#25151d] px-4 py-3 text-sm text-[#ff9ca8]">{error}</p> : null}

      {result ? (
        <section className="rounded-xl border border-[#24513a] bg-[#0e241c] p-4 text-sm text-[#dcefe4]">
          <div className="flex items-center gap-2 font-semibold text-[#75d391]">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Файл обработан
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
            <ResultItem label="Строк в файле" value={result.total_rows} />
            <ResultItem label="Добавлено" value={result.imported_rows} />
            <ResultItem label="Исключено" value={result.excluded_rows} />
            <ResultItem label="Дубликатов" value={result.duplicate_rows} />
          </dl>
          {result.error_rows > 0 ? <p className="mt-3 text-xs text-[#e9b979]">Строк с ошибками: {result.error_rows}. Они сохранены без учёта в статистике.</p> : null}
          {result.month ? (
            <button type="button" className="mt-4 rounded-lg bg-[#2f73b7] px-3 py-2 text-xs font-medium text-white hover:bg-[#3b83ca]" onClick={() => router.push('/month')}>
              Перейти к операциям
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#102b21] px-3 py-2">
      <dt className="text-[#86a597]">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-[#eef8f1]">{value}</dd>
    </div>
  );
}
