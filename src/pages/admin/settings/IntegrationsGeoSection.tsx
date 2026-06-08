import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { loadGeoConfig, saveGeoConfig } from './geoConfig';

const ALL_PROVIDERS = [
  { id: 'yandex',    label: 'Яндекс Геокодер', desc: 'Бесплатный с ограничениями. Ключ: developer.tech.yandex.ru' },
  { id: 'dadata',    label: 'DaData',           desc: 'Стандартизация адресов. Ключ: dadata.ru → API-ключи' },
  { id: 'maps_co',   label: 'geocode.maps.co',  desc: 'Бесплатный с ограничениями. Ключ: geocode.maps.co' },
  { id: 'nominatim', label: 'Nominatim OSM',    desc: 'Полностью бесплатный, без ключа, 1 запрос/сек' },
];

export default function IntegrationsGeoSection() {
  const [providers, setProviders] = useState<string[]>(['yandex', 'dadata', 'maps_co', 'nominatim']);
  const [limits, setLimits] = useState<Record<string, number>>({ yandex: 9999, dadata: 9999, maps_co: 9999, nominatim: 9999 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const cfg = loadGeoConfig();
    setProviders(cfg.providers);
    setLimits(cfg.limits);
  }, []);

  const handleSave = () => {
    saveGeoConfig({ providers, limits });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const moveUp = (idx: number) => setProviders(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; });
  const moveDown = (idx: number) => setProviders(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; });
  const remove = (pid: string) => setProviders(prev => prev.filter(p => p !== pid));
  const add = (pid: string) => setProviders(prev => [...prev, pid]);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="Globe" size={18} className="text-brand-blue" />
        Геокодеры для определения округов
      </div>
      <p className="text-sm text-muted-foreground">
        Порядок геокодеров при автоматическом определении округа улицы. При исчерпании лимита система переключается на следующий.
      </p>

      <div className="space-y-2">
        {providers.map((pid, idx) => {
          const info = ALL_PROVIDERS.find(p => p.id === pid)!;
          return (
            <div key={pid} className="flex items-center gap-3 border border-border rounded-xl px-3 py-2.5 bg-muted/30">
              <span className="text-muted-foreground text-xs font-bold w-4 text-center">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{info.label}</div>
                <div className="text-xs text-muted-foreground truncate">{info.desc}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Лимит:</span>
                  <input
                    type="number"
                    min={0}
                    max={99999}
                    value={limits[pid] === 9999 ? '' : limits[pid]}
                    placeholder="∞"
                    onChange={e => setLimits(prev => ({ ...prev, [pid]: e.target.value === '' ? 9999 : Math.max(0, Number(e.target.value)) }))}
                    className="w-20 text-sm px-2 py-1 border rounded-lg outline-none focus:border-brand-blue font-mono"
                  />
                </div>
                <div className="flex gap-0.5">
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

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <button onClick={handleSave}
          className="px-5 py-2.5 rounded-xl border-2 border-brand-blue text-brand-blue font-semibold inline-flex items-center gap-2 hover:bg-brand-blue hover:text-white transition-colors text-sm">
          <Icon name={saved ? 'Check' : 'Save'} size={14} />
          {saved ? 'Сохранено!' : 'Сохранить настройки'}
        </button>
        <span className="text-xs text-muted-foreground">Применяется в разделе Районы → Округа по улицам</span>
      </div>
    </div>
  );
}