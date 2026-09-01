import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { DashboardShell } from '@/components/dashboard-shell';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['cyrillic', 'latin'],
});

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
      <body className={`${geist.variable} antialiased`}>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
