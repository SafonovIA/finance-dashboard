import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { DashboardShell } from '@/components/dashboard-shell';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['cyrillic', 'latin'],
});

const applySavedSize = String.raw`(function () {
  var match = document.cookie.match(/(?:^|;\s*)finance_interface_size=(small|medium|large)(?:;|$)/);
  if (match) document.documentElement.dataset.interfaceSize = match[1];
})();`;

export const metadata: Metadata = {
  title: 'Финансовая статистика',
  description: 'Статистика доходов и расходов по месяцам',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <head><script dangerouslySetInnerHTML={{ __html: applySavedSize }} /></head>
      <body className={`${geist.variable} antialiased`}>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
