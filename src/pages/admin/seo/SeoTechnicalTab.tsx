import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { S } from '../settings/types';
import { SeoStatus, seoUrl, seoHeaders, fmtDate } from './seoTypes';

export type CheckStatus = 'idle' | 'checking' | 'ok' | 'err';
export interface CheckState { status: CheckStatus; message: string }
export const IDLE_STATE: CheckState = { status: 'idle', message: '' };

export function Badge({ value, check }: { value: string; check: CheckState }) {
  if (!value) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Circle" size={11} /> Не настроено
    </span>
  );
  if (check.status === 'idle') return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="Clock" size={11} /> Не проверено
    </span>
  );
  if (check.status === 'checking') return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Icon name="Loader2" size={11} className="animate-spin" /> Проверка...
    </span>
  );
  if (check.status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Icon name="CheckCircle2" size={11} /> Подключено
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <Icon name="XCircle" size={11} /> Не найдено
    </span>
  );
}

export default function SeoTechnicalTab() {
  const { reload } = useSettings();
  const { refreshToken } = useAuth();
  const [s, setS] = useState<Partial<S>>({});
  const [saved, setSaved] = useState(false);
  const [ymCheck, setYmCheck] = useState<CheckState>(IDLE_STATE);
  const [gaCheck, setGaCheck] = useState<CheckState>(IDLE_STATE);

  const [seoStatus, setSeoStatus] = useState<SeoStatus | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [gptOk, setGptOk] = useState(false);
  const [seoErr, setSeoErr] = useState('');

  useEffect(() => {
    adminApi.getSettings().then(d => setS(d.settings || {}));
    loadSeoStatus();
  }, []);

  const seoCall = async (payload: Record<string, unknown>) => {
    const tok = refreshToken();
    try {
      const r = await fetch(seoUrl(tok), {
        method: 'POST',
        headers: seoHeaders(tok),
        body: JSON.stringify({ ...payload, auth_token: tok || undefined }),
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
    const { data, error } = await seoCall({ action: 'files_status' });
    setSeoLoading(false);
    if (error) { setSeoErr(error); return; }
    if (data) {
      setSeoStatus(data as unknown as SeoStatus);
      setGptOk(!!data.gpt_configured);
    }
  };

  const rebuildSitemap = async () => {
    const { error } = await seoCall({ action: 'sitemap_rebuild' });
    if (error) { toast.error(error); return; }
    toast.success('Sitemap перестроен');
    loadSeoStatus();
  };

  const save = async () => {
    await adminApi.updateSettings(s as Record<string, unknown>);
    setSaved(true);
    await reload();
    setTimeout(() => setSaved(false), 2000);
  };

  const checkYm = (ymId: string): CheckState => {
    const w = window as Window & { ym?: unknown };
    const ok = Array.from(document.scripts).some(sc => sc.src.includes('mc.yandex.ru/metrika')) || typeof w.ym === 'function';
    return ok
      ? { status: 'ok', message: `Скрипт Яндекс.Метрики загружен (ID: ${ymId})` }
      : { status: 'err', message: 'Скрипт не найден. Убедитесь, что ID сохранён и обновите страницу.' };
  };

  const checkGa = (gaId: string): CheckState => {
    const w = window as Window & { gtag?: unknown };
    const ok = Array.from(document.scripts).some(sc => sc.src.includes('googletagmanager.com') || sc.src.includes(gaId)) || typeof w.gtag === 'function';
    return ok
      ? { status: 'ok', message: `Google Analytics загружен (${gaId})` }
      : { status: 'err', message: 'Скрипт не найден. Убедитесь, что ID сохранён и обновите страницу.' };
  };

  return (
    <div className="space-y-4">

      {/* Robots & Sitemap */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="FileCode2" size={18} className="text-brand-blue" /> Robots.txt и Sitemap.xml
        </div>

        {seoErr && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{seoErr}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Robots */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Icon name="Shield" size={16} className="text-brand-blue" />
              <span className="font-semibold text-sm">robots.txt</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Управляет индексацией разделов сайта. Закрывает /admin, /login и системные страницы.
            </div>
            {seoStatus && (
              <div className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
                seoStatus.robots_exists ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <Icon name={seoStatus.robots_exists ? 'CheckCircle2' : 'AlertCircle'} size={11} />
                {seoStatus.robots_exists ? 'Файл существует' : 'Не создан'}
              </div>
            )}
            {seoLoading && <div className="text-xs text-muted-foreground">Загрузка...</div>}
          </div>

          {/* Sitemap */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icon name="Map" size={16} className="text-brand-blue" />
              <span className="font-semibold text-sm">sitemap.xml</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Карта сайта для поисковых систем. Включает объекты, новости и статические страницы.
            </div>
            {seoStatus && (
              <div className="space-y-2">
                {/* Итого в кэше */}
                <div className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
                  seoStatus.sitemap_exists ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  <Icon name={seoStatus.sitemap_exists ? 'CheckCircle2' : 'AlertCircle'} size={11} />
                  {seoStatus.sitemap_exists
                    ? `В кэше: ${seoStatus.sitemap_urls_count ?? '?'} URL`
                    : 'Не создан — нажмите «Перестроить»'}
                </div>
                {/* Разбивка по источникам */}
                {seoStatus.breakdown && (
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { label: 'Объекты', value: seoStatus.breakdown.listings, color: 'bg-brand-blue/10 text-brand-blue' },
                      { label: 'Новости', value: seoStatus.breakdown.news, color: 'bg-purple-100 text-purple-700' },
                      { label: 'Страницы', value: seoStatus.breakdown.static, color: 'bg-emerald-100 text-emerald-700' },
                    ].map(b => (
                      <div key={b.label} className={`rounded-lg px-2 py-1.5 ${b.color}`}>
                        <div className="text-sm font-bold">{b.value}</div>
                        <div className="text-[10px]">{b.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Предупреждение о расхождении кэша и реальных данных */}
                {seoStatus.breakdown && seoStatus.sitemap_urls_count !== undefined &&
                  seoStatus.sitemap_urls_count < seoStatus.breakdown.total_expected && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    <Icon name="AlertCircle" size={11} className="mt-0.5 shrink-0" />
                    Кэш устарел: в БД {seoStatus.breakdown.total_expected} URL, в sitemap {seoStatus.sitemap_urls_count}. Нажмите «Перестроить».
                  </div>
                )}
                {/* Дата обновления кэша */}
                {seoStatus.sitemap_updated_at && (
                  <div className="text-[10px] text-muted-foreground">
                    Обновлён: {fmtDate(seoStatus.sitemap_updated_at)}
                  </div>
                )}
                {/* Ссылка на файл */}
                {seoStatus.sitemap_url && (
                  <a href={seoStatus.sitemap_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-brand-blue hover:underline">
                    <Icon name="ExternalLink" size={10} /> Открыть sitemap.xml
                  </a>
                )}
              </div>
            )}
            <button
              onClick={rebuildSitemap}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5"
            >
              <Icon name="RefreshCw" size={12} /> Перестроить
            </button>
          </div>
        </div>

        {!gptOk && (
          <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
            <Icon name="AlertCircle" size={13} className="mt-0.5 shrink-0" />
            Для автогенерации robots.txt и sitemap настройте YandexGPT в Настройки → Интеграции.
          </div>
        )}
      </div>

      {/* Яндекс.Метрика */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="BarChart3" size={18} className="text-brand-blue" /> Счётчики аналитики
        </div>

        <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
          ymCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
          : ymCheck.status === 'err' ? 'border-red-200 bg-red-50/20' : 'border-border'
        }`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс.Метрика</span>
              <span className="text-xs text-muted-foreground">Посещаемость и поведение</span>
            </div>
            <Badge value={s.yandex_metrika_id || ''} check={ymCheck} />
          </div>
          <input className="w-full px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
            placeholder="например 12345678"
            value={s.yandex_metrika_id || ''}
            onChange={e => { setS({ ...s, yandex_metrika_id: e.target.value }); setYmCheck(IDLE_STATE); }} />
          <div className="text-xs text-muted-foreground">
            Получить: <a href="https://metrika.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">metrika.yandex.ru</a> → создать счётчик → скопировать номер.
          </div>
          {ymCheck.status !== 'idle' && ymCheck.status !== 'checking' && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${ymCheck.status === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              <Icon name={ymCheck.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
              <span>{ymCheck.message}</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button"
              onClick={() => {
                const id = (s.yandex_metrika_id || '').trim();
                if (!id) { setYmCheck({ status: 'err', message: 'Введите ID счётчика' }); return; }
                setYmCheck({ status: 'checking', message: '' });
                setTimeout(() => setYmCheck(checkYm(id)), 300);
              }}
              disabled={ymCheck.status === 'checking' || !s.yandex_metrika_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40">
              {ymCheck.status === 'checking'
                ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
                : <><Icon name="Zap" size={12} /> Проверить на странице</>}
            </button>
            <a href="https://metrika.yandex.ru" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue">
              <Icon name="ExternalLink" size={12} /> Открыть Метрику
            </a>
          </div>
        </div>

        {/* Google Analytics */}
        <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
          gaCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
          : gaCheck.status === 'err' ? 'border-red-200 bg-red-50/20' : 'border-border'
        }`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Google Analytics (GA4)</span>
              <span className="text-xs text-muted-foreground">Трафик и конверсии</span>
            </div>
            <Badge value={s.google_analytics_id || ''} check={gaCheck} />
          </div>
          <input className="w-full px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
            placeholder="G-XXXXXXXXXX"
            value={s.google_analytics_id || ''}
            onChange={e => { setS({ ...s, google_analytics_id: e.target.value }); setGaCheck(IDLE_STATE); }} />
          <div className="text-xs text-muted-foreground">
            Получить: <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="text-brand-blue underline">analytics.google.com</a> → Admin → Data Streams → скопировать Measurement ID.
          </div>
          {gaCheck.status !== 'idle' && gaCheck.status !== 'checking' && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${gaCheck.status === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              <Icon name={gaCheck.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
              <span>{gaCheck.message}</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button"
              onClick={() => {
                const id = (s.google_analytics_id || '').trim();
                if (!id) { setGaCheck({ status: 'err', message: 'Введите ID счётчика' }); return; }
                setGaCheck({ status: 'checking', message: '' });
                setTimeout(() => setGaCheck(checkGa(id)), 300);
              }}
              disabled={gaCheck.status === 'checking' || !s.google_analytics_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40">
              {gaCheck.status === 'checking'
                ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
                : <><Icon name="Zap" size={12} /> Проверить на странице</>}
            </button>
            <a href="https://analytics.google.com" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue">
              <Icon name="ExternalLink" size={12} /> Открыть Analytics
            </a>
          </div>
        </div>
      </div>

      {/* Счётчики — сохранение */}
      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm font-semibold">Сохранено ✓</span>}
      </div>
    </div>
  );
}