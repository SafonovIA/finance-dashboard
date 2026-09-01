'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { requestJson } from '@/lib/api';

type MonthOption = { value: string; label: string };

type MonthContextValue = {
  months: MonthOption[];
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  refreshMonths: (preferredMonth?: string | null) => Promise<void>;
  loading: boolean;
};

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: React.ReactNode }) {
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [selectedMonth, setSelectedMonthState] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshMonths = useCallback(async (preferredMonth?: string | null) => {
    try {
      const items = await requestJson<MonthOption[]>('/api/months');
      setMonths(items);
      setSelectedMonthState((current) => {
        const stored = typeof window === 'undefined' ? '' : window.localStorage.getItem('finance-month') ?? '';
        const candidate = preferredMonth ?? current ?? stored;
        return items.some((item) => item.value === candidate) ? candidate : (items[0]?.value ?? '');
      });
    } catch {
      setMonths([]);
      setSelectedMonthState('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshMonths(), 0);
    const onDataUpdated = () => void refreshMonths();
    window.addEventListener('finance-data-updated', onDataUpdated);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('finance-data-updated', onDataUpdated);
    };
  }, [refreshMonths]);

  const setSelectedMonth = useCallback((month: string) => {
    setSelectedMonthState(month);
    window.localStorage.setItem('finance-month', month);
  }, []);

  const value = useMemo(
    () => ({ months, selectedMonth, setSelectedMonth, refreshMonths, loading }),
    [months, selectedMonth, setSelectedMonth, refreshMonths, loading],
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth() {
  const context = useContext(MonthContext);
  if (!context) throw new Error('useMonth must be used inside MonthProvider');
  return context;
}
