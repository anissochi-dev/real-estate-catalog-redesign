import { useEffect, useState } from 'react';
import { StalePlatform, SYNC_HEALTH_API_URL } from './types';

/** Единый источник правды для «здоровья» автообновления рекламных площадок —
 * используется и во всплывающем уведомлении при входе администратора (один раз
 * за сессию), и в баннере на самом дашборде рекламного кабинета. Один и тот же
 * backend-эндпоинт (action=sync_health), поэтому оба места всегда показывают
 * одинаковые данные без риска рассинхронизации. */
export function useSyncHealth(enabled: boolean) {
  const [stale, setStale] = useState<StalePlatform[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    fetch(SYNC_HEALTH_API_URL)
      .then(r => r.json())
      .then(d => { if (d.ok) setStale(d.stale || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  return { stale, loading };
}
