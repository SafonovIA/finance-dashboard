'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const acceptedExtensions = ['.xlsx', '.xls'];

export function FileUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const chooseFile = (file?: File) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (acceptedExtensions.some((extension) => lowerName.endsWith(extension))) {
      setFileName(file.name);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className={cn(
          'flex min-h-[290px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#2f68a2] bg-[#091727] px-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#4389d8] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
          chooseFile(event.dataTransfer.files?.[0]);
        }}
      >
        {fileName ? (
          <>
            <FileSpreadsheet className="mb-4 size-12 text-[#77b8f4]" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-sm font-medium text-[#edf4fb]">{fileName}</span>
          </>
        ) : (
          <>
            <UploadCloud className="mb-4 size-14 text-[#77b8f4]" strokeWidth={1.35} aria-hidden="true" />
            <span className="text-sm font-medium text-[#e9f1f8]">Перетащите файл сюда</span>
            <span className="mt-1 text-xs text-[#8292a7]">или нажмите для выбора</span>
          </>
        )}
        <span className="mt-5 text-[11px] text-[#607187]">Поддерживаются файлы Excel (.xlsx, .xls)</span>
      </button>
    </div>
  );
}
