import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { adminApi } from '@/lib/adminApi';

interface Ctx {
  logos: Record<string, string>;
  reload: () => Promise<void>;
}

const PlatformLogosCtx = createContext<Ctx>({ logos: {}, reload: async () => {} });

/** Грузит логотипы площадок (Авито/ЦИАН/Яндекс.Недвижимость/ДомКлик/Юла) один раз
 * при входе в админку и раздаёт их всем компонентам, которые показывают площадку
 * (бейджи в списке объектов, кабинеты, XML фиды и т.д.) — без повторных запросов. */
export function PlatformLogosProvider({ children }: { children: ReactNode }) {
  const [logos, setLogos] = useState<Record<string, string>>({});

  const reload = async () => {
    try {
      const r = await adminApi.getPlatformLogos();
      setLogos(r.logos || {});
    } catch { /* тихо игнорируем — иконки-заглушки останутся как есть */ }
  };

  useEffect(() => { reload(); }, []);

  return <PlatformLogosCtx.Provider value={{ logos, reload }}>{children}</PlatformLogosCtx.Provider>;
}

export function usePlatformLogos() {
  return useContext(PlatformLogosCtx);
}
