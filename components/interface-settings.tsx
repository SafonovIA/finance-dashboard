'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type InterfaceSize = 'small' | 'medium' | 'large';
const SettingsContext = createContext({ size: 'small' as InterfaceSize, setSize: (_size: InterfaceSize) => {} });
const storageKey = 'finance-interface-size';

export function InterfaceSettingsProvider({ children }: { children: React.ReactNode }) {
  const [size, updateSize] = useState<InterfaceSize>('small');
  const applySize = (next: InterfaceSize) => {
    document.documentElement.dataset.interfaceSize = next;
    updateSize(next);
  };
  useEffect(() => {
    const read = () => {
      try {
        const value = localStorage.getItem(storageKey);
        applySize(value === 'medium' || value === 'large' ? value : 'small');
      } catch { /* Keep the default when browser storage is unavailable. */ }
    };
    const timer = window.setTimeout(read, 0);
    window.addEventListener('storage', read);
    return () => { window.clearTimeout(timer); window.removeEventListener('storage', read); };
  }, []);
  const setSize = (next: InterfaceSize) => {
    applySize(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Still applies for this session. */ }
  };
  return <SettingsContext.Provider value={{ size, setSize }}>{children}</SettingsContext.Provider>;
}

export const useInterfaceSettings = () => useContext(SettingsContext);
