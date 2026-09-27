'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { requestJson } from '@/lib/api';

export type InterfaceSize = 'small' | 'medium' | 'large';

type InterfaceSettings = {
  size: InterfaceSize;
  setSize: (size: InterfaceSize) => Promise<void>;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const SettingsContext = createContext<InterfaceSettings>({
  size: 'small', setSize: async () => {}, loading: true, saving: false, error: null,
});

function isInterfaceSize(value: unknown): value is InterfaceSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function InterfaceSettingsProvider({ children }: { children: React.ReactNode }) {
  const [size, updateSize] = useState<InterfaceSize>('small');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applySize = (next: InterfaceSize) => {
    document.documentElement.dataset.interfaceSize = next;
    updateSize(next);
  };
  useEffect(() => {
    let active = true;
    const initialSize = document.documentElement.dataset.interfaceSize;
    if (isInterfaceSize(initialSize)) updateSize(initialSize);
    void requestJson<{ interface_size: string }>('/api/auth/profile')
      .then((profile) => {
        if (active) applySize(isInterfaceSize(profile.interface_size) ? profile.interface_size : 'small');
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить размер интерфейса');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setSize = async (next: InterfaceSize) => {
    if (loading || saving || next === size) return;
    const previous = size;
    setError(null);
    setSaving(true);
    applySize(next);
    try {
      await requestJson<{ interface_size: InterfaceSize }>('/api/auth/interface-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface_size: next }),
      });
    } catch (saveError) {
      applySize(previous);
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить размер интерфейса');
    } finally {
      setSaving(false);
    }
  };
  return <SettingsContext.Provider value={{ size, setSize, loading, saving, error }}>{children}</SettingsContext.Provider>;
}

export const useInterfaceSettings = () => useContext(SettingsContext);
