import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S } from '../settings/types';
import { Badge, CheckState, IDLE_STATE } from './SeoCheckBadge';

interface Props {
  s: Partial<S>;
  setS: (s: Partial<S>) => void;
}

export default function SeoAnalyticsCard({ s, setS }: Props) {
  const [ymCheck, setYmCheck] = useState<CheckState>(IDLE_STATE);
  const [gaCheck, setGaCheck] = useState<CheckState>(IDLE_STATE);

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
    <>
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
    </>
  );
}
