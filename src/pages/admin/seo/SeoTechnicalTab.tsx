import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { S } from '../settings/types';
import { SeoStatus, SITEMAP_BASE } from './seoTypes';
import { usePrerender } from './usePrerender';
import SeoSitemapCard from './SeoSitemapCard';
import SeoPrerenderCard from './SeoPrerenderCard';
import SeoAnalyticsCard from './SeoAnalyticsCard';

export { Badge, IDLE_STATE } from './SeoCheckBadge';
export type { CheckStatus, CheckState } from './SeoCheckBadge';

export default function SeoTechnicalTab() {
  const { reload } = useSettings();
  const { refreshToken } = useAuth();
  const [s, setS] = useState<Partial<S>>({});
  const [saved, setSaved] = useState(false);

  const [seoStatus, setSeoStatus] = useState<SeoStatus | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoErr, setSeoErr] = useState('');
  const [rebuilding, setRebuilding] = useState(false);
  const prerender = usePrerender();

  useEffect(() => {
    adminApi.getSettings().then(d => setS(d.settings || {}));
    loadSeoStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sitemapCall = async (action: string) => {
    const tok = refreshToken();
    try {
      const url = tok ? `${SITEMAP_BASE}?auth_token=${encodeURIComponent(tok)}` : SITEMAP_BASE;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { 'X-Auth-Token': tok } : {}) },
        body: JSON.stringify({ action, auth_token: tok || undefined }),
      });
      if (!r.ok) return { data: null, error: `Ошибка ${r.status}` };
      const d = await r.json();
      if (d?.error) return { data: null, error: String(d.error) };
      return { data: d, error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Нет связи' };
    }
  };

  const loadSeoStatus = async () => {
    setSeoLoading(true);
    setSeoErr('');
    const { data, error } = await sitemapCall('status');
    setSeoLoading(false);
    if (error) { setSeoErr(error); return; }
    if (data) setSeoStatus(data as unknown as SeoStatus);
  };

  const rebuildSitemap = async () => {
    setRebuilding(true);
    const { data, error } = await sitemapCall('rebuild');
    setRebuilding(false);
    if (error) { toast.error(`Ошибка: ${error}`); return; }
    toast.success(`Sitemap перестроен: ${data?.urls_count ?? '?'} URL в кэше БД. Изменения появятся после следующего деплоя.`);
    loadSeoStatus();
  };

  const save = async () => {
    await adminApi.updateSettings(s as Record<string, unknown>);
    setSaved(true);
    await reload();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">

      <SeoSitemapCard
        seoErr={seoErr}
        seoStatus={seoStatus}
        seoLoading={seoLoading}
        rebuilding={rebuilding}
        rebuildSitemap={rebuildSitemap}
      />

      <SeoPrerenderCard {...prerender} />

      <SeoAnalyticsCard s={s} setS={setS} />

      {/* Счётчики — сохранение */}
      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm font-semibold">Сохранено ✓</span>}
      </div>
    </div>
  );
}
