'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMonth } from '@/components/month-context';

export default function AllTimeRedirect() {
  const router = useRouter();
  const { setStatisticsAllTime } = useMonth();
  useEffect(() => {
    setStatisticsAllTime(true);
    router.replace('/');
  }, [router, setStatisticsAllTime]);
  return <p className="text-sm text-[#91a2b5]">Переход к статистике за всё время…</p>;
}
