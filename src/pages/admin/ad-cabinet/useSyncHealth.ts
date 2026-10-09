import { useEffect, useState } from 'react';
import { FailingPlatform, StalePlatform, SYNC_HEALTH_API_URL } from './types';

const REFRESH_MS = 5 * 60 * 1000;

/** Единый источник правды для «здоровья» автообновления рекламных площадок —
 * используется во всплывающем уведомлении при входе администратора (один раз
 * за сессию), в баннере на дашборде рекламного кабинета и в колокольчике админки.
 * Один и тот же backend-эндпоинт (action=sync_health), поэтому все места всегда
 * показывают одинаковые данные. Обновляется раз в 5 минут, пока открыта админка. */
export function useSyncHealth(enabled: boolean) {
  const [stale, setStale] = useState<StalePlatform[]>([]);
  const [failing, setFailing] = useState<FailingPlatform[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const load = () => {
      fetch(SYNC_HEALTH_API_URL)
        .then(r => r.json())
        .then(d => {
          if (d.ok) {
            setStale(d.stale || []);
            setFailing(d.failing || []);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [enabled]);

  return { stale, failing, loading };
}
