import { FileUpload } from '@/components/file-upload';

const steps = [
  'Загрузите Excel файл с вашими доходами и расходами',
  'Ошибки, дубликаты и внутренние переводы будут проверены',
  'Операции будут распределены по категориям',
  'Результаты появятся в статистике и месячном отчете',
];

export default function UploadPage() {
  return (
    <div className="space-y-5">
      <FileUpload />
      <section className="rounded-xl border border-[#15283b] bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-[#e4ebf3]">Как это работает?</h2>
        <ol className="space-y-2 text-xs leading-5 text-[#8f9fb0]">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span className="tabular-nums text-[#61758a]">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
