import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

type SettingsShape = {
  siteName: string;
  currencySymbol: string;
  
  enableReservations?: boolean;
  totalAvailableBays?: number;
  refresh: () => Promise<void>;
};

const defaultSettings: SettingsShape = {
  siteName: 'Eagle Point',
  currencySymbol: '₱',
  enableReservations: true,
  totalAvailableBays: 45,
  refresh: async () => {},
};

const SettingsContext = createContext<SettingsShape>(defaultSettings);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsShape>(defaultSettings);

  const baseUrl = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';

  const load = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/settings`, { method: 'GET', credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setSettings((s) => ({
        ...s,
        siteName: data?.siteName ?? data?.site_name ?? s.siteName,
        currencySymbol: data?.currencySymbol ?? data?.currency_symbol ?? s.currencySymbol,
        
        enableReservations: typeof data?.enableReservations === 'boolean' ? data.enableReservations : s.enableReservations,
        totalAvailableBays: Number(data?.totalAvailableBays ?? data?.total_available_bays ?? s.totalAvailableBays),
      }));
    } catch {
      // ignore network errors and keep defaults
    }
  };
   
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // initial load
    load();

    // listen for explicit settings updates from other parts of the app
    const onSettingsUpdated = () => {
      load();
    };

    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('settings:updated', onSettingsUpdated as EventListener);
      }
    } catch {}

    return () => {
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('settings:updated', onSettingsUpdated as EventListener);
        }
      } catch {}
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <SettingsContext.Provider value={{ ...settings, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);

export default SettingsProvider;
