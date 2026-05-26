import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchPublicSettings, PublicSettings } from '@/lib/api';

interface Ctx {
  settings: PublicSettings;
  reload: () => Promise<void>;
}

const SettingsCtx = createContext<Ctx | null>(null);

const CACHE_KEY = 'bmn_settings_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

function readCache(): PublicSettings | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return data;
  } catch { /* ignore */ }
  return null;
}

function writeCache(data: PublicSettings) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(() => readCache() ?? {});

  const reload = async () => {
    const s = await fetchPublicSettings();
    setSettings(s);
    writeCache(s);
  };

  useEffect(() => {
    // Если кэш валиден — не делаем запрос при монтировании
    if (readCache()) return;
    reload();
  }, []);

  return <SettingsCtx.Provider value={{ settings, reload }}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const v = useContext(SettingsCtx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}