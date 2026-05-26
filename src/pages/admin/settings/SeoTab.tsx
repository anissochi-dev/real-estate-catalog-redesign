import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

type CheckStatus = 'idle' | 'checking' | 'ok' | 'err';
interface CheckState { status: CheckStatus; message: string }
const IDLE: CheckState = { status: 'idle', message: '' };

function Badge({ value, check }: { value: string; check: CheckState }) {
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

function checkYm(ymId: string): CheckState {
  const w = window as Window & { ym?: unknown };
  // Проверяем наличие скрипта Метрики в DOM
  const scriptLoaded = Array.from(document.scripts).some(s => s.src.includes('mc.yandex.ru/metrika'));
  const fnExists = typeof w.ym === 'function';
  if (scriptLoaded || fnExists) {
    return { status: 'ok', message: `Скрипт Яндекс.Метрики загружен (ID: ${ymId})` };
  }
  return { status: 'err', message: 'Скрипт не найден на странице. Убедитесь, что ID сохранён и обновите страницу.' };
}

function checkGa(gaId: string): CheckState {
  const w = window as Window & { gtag?: unknown; dataLayer?: unknown[] };
  const scriptLoaded = Array.from(document.scripts).some(s => s.src.includes('googletagmanager.com') || s.src.includes(gaId));
  const gtagExists = typeof w.gtag === 'function';
  if (scriptLoaded || gtagExists) {
    return { status: 'ok', message: `Google Analytics загружен (${gaId})` };
  }
  return { status: 'err', message: 'Скрипт не найден на странице. Убедитесь, что ID сохранён и обновите страницу.' };
}

export default function SeoTab({ s, setS, saved, save }: Props) {
  const [ymCheck,  setYmCheck]  = useState<CheckState>(IDLE);
  const [gaCheck,  setGaCheck]  = useState<CheckState>(IDLE);

  const runYmCheck = () => {
    const id = (s.yandex_metrika_id || '').trim();
    if (!id) { setYmCheck({ status: 'err', message: 'Введите ID счётчика' }); return; }
    setYmCheck({ status: 'checking', message: '' });
    // Даём 300мс на инициализацию если только что сохранили
    setTimeout(() => setYmCheck(checkYm(id)), 300);
  };

  const runGaCheck = () => {
    const id = (s.google_analytics_id || '').trim();
    if (!id) { setGaCheck({ status: 'err', message: 'Введите ID счётчика' }); return; }
    setGaCheck({ status: 'checking', message: '' });
    setTimeout(() => setGaCheck(checkGa(id)), 300);
  };

  return (
    <div className="space-y-4">

      {/* ── Счётчики аналитики ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="BarChart3" size={18} /> Счётчики аналитики
        </div>

        {/* Яндекс.Метрика */}
        <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
          ymCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
          : ymCheck.status === 'err' ? 'border-red-200 bg-red-50/20'
          : 'border-border'
        }`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс.Метрика</span>
              <span className="text-xs text-muted-foreground">Посещаемость и поведение</span>
            </div>
            <Badge value={s.yandex_metrika_id || ''} check={ymCheck} />
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
            placeholder="например 12345678"
            value={s.yandex_metrika_id || ''}
            onChange={e => { setS({ ...s, yandex_metrika_id: e.target.value }); setYmCheck(IDLE); }}
          />
          <div className="text-xs text-muted-foreground">
            Получить: <a href="https://metrika.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">metrika.yandex.ru</a> → создать счётчик → скопировать номер.
          </div>
          {ymCheck.status !== 'idle' && ymCheck.status !== 'checking' && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
              ymCheck.status === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <Icon name={ymCheck.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
              <span>{ymCheck.message}</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={runYmCheck}
              disabled={ymCheck.status === 'checking' || !s.yandex_metrika_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40"
            >
              {ymCheck.status === 'checking'
                ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
                : <><Icon name="Zap" size={12} /> Проверить на странице</>
              }
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
          : gaCheck.status === 'err' ? 'border-red-200 bg-red-50/20'
          : 'border-border'
        }`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Google Analytics (GA4)</span>
              <span className="text-xs text-muted-foreground">Трафик и конверсии</span>
            </div>
            <Badge value={s.google_analytics_id || ''} check={gaCheck} />
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
            placeholder="G-XXXXXXXXXX"
            value={s.google_analytics_id || ''}
            onChange={e => { setS({ ...s, google_analytics_id: e.target.value }); setGaCheck(IDLE); }}
          />
          <div className="text-xs text-muted-foreground">
            Получить: <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="text-brand-blue underline">analytics.google.com</a> → Admin → Data Streams.
          </div>
          {gaCheck.status !== 'idle' && gaCheck.status !== 'checking' && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
              gaCheck.status === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <Icon name={gaCheck.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
              <span>{gaCheck.message}</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={runGaCheck}
              disabled={gaCheck.status === 'checking' || !s.google_analytics_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40"
            >
              {gaCheck.status === 'checking'
                ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
                : <><Icon name="Zap" size={12} /> Проверить на странице</>
              }
            </button>
            <a href="https://analytics.google.com" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue">
              <Icon name="ExternalLink" size={12} /> Открыть Analytics
            </a>
          </div>
        </div>
      </div>

      {/* ── SEO ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Search" size={18} /> SEO — для поисковых систем
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Адрес сайта</label>
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 border rounded-lg" placeholder="https://example.ru"
              value={s.site_url || ''}
              onChange={e => setS({ ...s, site_url: e.target.value })} />
            {!s.site_url && (
              <button
                type="button"
                onClick={() => setS({ ...s, site_url: window.location.origin })}
                className="px-3 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 whitespace-nowrap"
              >
                Заполнить автоматически
              </button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Используется в sitemap.xml и Open Graph.</div>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Год основания</label>
          <input type="number" className="w-full px-3 py-2 border rounded-lg" placeholder="2007"
            value={s.company_since_year ?? 2007}
            onChange={e => setS({ ...s, company_since_year: +e.target.value })} />
          <div className="text-xs text-muted-foreground mt-1">Отображается на главной: «На рынке с 2007».</div>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">SEO-описание сайта</label>
          <textarea rows={3} className="w-full px-3 py-2 border rounded-lg"
            placeholder="Каталог коммерческой недвижимости и готового бизнеса в Краснодаре с 2007 года..."
            value={s.seo_description || ''}
            onChange={e => setS({ ...s, seo_description: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Ключевые слова</label>
          <input className="w-full px-3 py-2 border rounded-lg"
            placeholder="коммерческая недвижимость, готовый бизнес, аренда офиса"
            value={s.seo_keywords || ''}
            onChange={e => setS({ ...s, seo_keywords: e.target.value })} />
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}
