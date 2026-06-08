import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { loadGeoConfig, saveGeoConfig } from './geoConfig';

const GEO_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';

const ALL_PROVIDERS = [
  { id: 'yandex',    label: 'Яндекс Геокодер', desc: 'Бесплатный с ограничениями. Ключ: developer.tech.yandex.ru' },
  { id: 'dadata',    label: 'DaData',           desc: 'Стандартизация адресов. Ключ: dadata.ru → API-ключи' },
  { id: 'maps_co',   label: 'geocode.maps.co',  desc: 'Бесплатный с ограничениями. Ключ: geocode.maps.co' },
  { id: 'nominatim', label: 'Nominatim OSM',    desc: 'Полностью бесплатный, без ключа, 1 запрос/сек' },
];

type Quota = { used: number; limit: number; day_start: string; remaining: number | null };

export default function IntegrationsGeoSection() {
  const [providers, setProviders] = useState<string[]>(['yandex', 'dadata', 'maps_co', 'nominatim']);
  const [limits, setLimits] = useState<Record<string, number>>({ yandex: 9999, dadata: 9999, maps_co: 9999, nominatim: 9999 });
  const [saved, setSaved] = useState(false);
  const [quota, setQuota] = useState<Record<string, Quota> | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [savingLimit, setSavingLimit] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    const cfg = loadGeoConfig();
    setProviders(cfg.providers);
    setLimits(cfg.limits);
  }, []);

  const loadQuota = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const res = await fetch(GEO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'geo_quota', mode: 'get' }) });
      const data = await res.json();
      if (data.quota) setQuota(data.quota);
    } finally { setQuotaLoading(false); }
  }, []);

  useEffect(() => { loadQuota(); }, [loadQuota]);

  const handleSaveOrder = () => {
    saveGeoConfig({ providers, limits });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveLimit = async (pid: string) => {
    setSavingLimit(pid);
    try {
      const res = await fetch(GEO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'geo_quota', mode: 'set_limit', provider: pid, limit: limits[pid] }) });
      const data = await res.json();
      if (data.quota) setQuota(data.quota);
      saveGeoConfig({ providers, limits });
    } finally { setSavingLimit(null); }
  };

  const handleReset = async (pid: string) => {
    if (!window.confirm(`Сбросить счётчик "${ALL_PROVIDERS.find(p => p.id === pid)?.label}"?`)) return;
    setResetting(pid);
    try {
      const res = await fetch(GEO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'geo_quota', mode: 'reset', provider: pid }) });
      const data = await res.json();
      if (data.quota) setQuota(data.quota);
    } finally { setResetting(null); }
  };

  const moveUp   = (idx: number) => setProviders(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; });
  const moveDown = (idx: number) => setProviders(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; });
  const remove   = (pid: string) => setProviders(prev => prev.filter(p => p !== pid));
  const add      = (pid: string) => setProviders(prev => [...prev, pid]);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display font-700 text-lg flex items-center gap-2">
            <Icon name="Globe" size={18} className="text-brand-blue" />
            Геокодеры для определения округов
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Порядок провайдеров и дневные лимиты запросов. Счётчик сбрасывается каждый день в 00:01.
          </p>
        </div>
        <button onClick={loadQuota} disabled={quotaLoading}
          className="p-2 rounded-lg border hover:bg-muted transition disabled:opacity-50">
          <Icon name={quotaLoading ? 'Loader2' : 'RefreshCw'} size={14} className={quotaLoading ? 'animate-spin text-muted-foreground' : 'text-muted-foreground'} />
        </button>
      </div>

      {/* Счётчики */}
      {quota && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_PROVIDERS.map(p => {
            const q = quota[p.id];
            if (!q) return null;
            const isOver = q.limit < 9999 && q.used >= q.limit;
            return (
              <div key={p.id} className={`rounded-xl border p-3 space-y-1 ${isOver ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30'}`}>
                <div className="text-xs font-semibold text-muted-foreground">{p.label}</div>
                <div className={`text-lg font-bold ${isOver ? 'text-red-600' : 'text-foreground'}`}>
                  {q.used} <span className="text-sm font-normal text-muted-foreground">/ {q.limit === 9999 ? '∞' : q.limit}</span>
                </div>
                <div className="text-xs text-muted-foreground">сегодня</div>
                {isOver && <div className="text-xs text-red-600 font-medium">лимит исчерпан</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Список провайдеров */}
      <div className="space-y-2">
        {providers.map((pid, idx) => {
          const info = ALL_PROVIDERS.find(p => p.id === pid)!;
          const q = quota?.[pid];
          const isOver = q && q.limit < 9999 && q.used >= q.limit;
          return (
            <div key={pid} className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${isOver ? 'border-red-200 bg-red-50/50' : 'border-border bg-muted/20'}`}>
              <span className="text-muted-foreground text-xs font-bold w-4 text-center">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  {info.label}
                  {isOver && <span className="text-xs text-red-500 font-normal">(лимит)</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{info.desc}</div>
              </div>
              {/* Лимит */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:block">Лимит/день:</span>
                <input
                  type="number" min={0} max={99999}
                  value={limits[pid] === 9999 ? '' : limits[pid]}
                  placeholder="∞"
                  onChange={e => setLimits(prev => ({ ...prev, [pid]: e.target.value === '' ? 9999 : Math.max(0, Number(e.target.value)) }))}
                  className="w-20 text-sm px-2 py-1 border rounded-lg outline-none focus:border-brand-blue font-mono"
                />
                <button onClick={() => handleSaveLimit(pid)} disabled={savingLimit === pid}
                  title="Сохранить лимит"
                  className="p-1.5 rounded hover:bg-muted transition disabled:opacity-50">
                  <Icon name={savingLimit === pid ? 'Loader2' : 'Save'} size={13} className={`text-brand-blue ${savingLimit === pid ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => handleReset(pid)} disabled={resetting === pid}
                  title="Сбросить счётчик"
                  className="p-1.5 rounded hover:bg-muted transition disabled:opacity-50">
                  <Icon name={resetting === pid ? 'Loader2' : 'RotateCcw'} size={13} className={`text-muted-foreground ${resetting === pid ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {/* Порядок / удаление */}
              <div className="flex gap-0.5 shrink-0">
                <button disabled={idx === 0} onClick={() => moveUp(idx)}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition">
                  <Icon name="ChevronUp" size={14} className="text-muted-foreground" />
                </button>
                <button disabled={idx === providers.length - 1} onClick={() => moveDown(idx)}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition">
                  <Icon name="ChevronDown" size={14} className="text-muted-foreground" />
                </button>
                <button onClick={() => remove(pid)}
                  className="p-1.5 rounded hover:bg-red-50 transition">
                  <Icon name="X" size={14} className="text-red-400" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {providers.length < ALL_PROVIDERS.length && (
        <div className="flex gap-2 flex-wrap">
          {ALL_PROVIDERS.filter(p => !providers.includes(p.id)).map(p => (
            <button key={p.id} onClick={() => add(p.id)}
              className="text-sm px-3 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted transition flex items-center gap-1.5">
              <Icon name="Plus" size={13} /> {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleSaveOrder}
          className="px-5 py-2.5 rounded-xl border-2 border-brand-blue text-brand-blue font-semibold inline-flex items-center gap-2 hover:bg-brand-blue hover:text-white transition-colors text-sm">
          <Icon name={saved ? 'Check' : 'Save'} size={14} />
          {saved ? 'Порядок сохранён!' : 'Сохранить порядок'}
        </button>
        <span className="text-xs text-muted-foreground">Лимиты сохраняются в БД кнопкой 💾 рядом с каждым провайдером</span>
      </div>
    </div>
  );
}
