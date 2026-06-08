import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
const GEO_URL = 'https://functions.poehali.dev/94f11c58-4ec2-4d37-9918-69d86bfb02b8';

const OSM_TYPES = [
  { key: 'tram_stop',       label: 'Трамвайные остановки',  icon: 'Tram' },
  { key: 'bus_stop',        label: 'Автобусные остановки',   icon: 'Bus' },
  { key: 'subway_entrance', label: 'Метро / электро',        icon: 'Train' },
  { key: 'railway_station', label: 'ЖД-вокзалы',             icon: 'TrainFront' },
  { key: 'shopping_mall',   label: 'Торговые центры',         icon: 'ShoppingBag' },
  { key: 'supermarket',     label: 'Супермаркеты',            icon: 'ShoppingCart' },
  { key: 'market',          label: 'Рынки',                  icon: 'Store' },
  { key: 'business_center', label: 'Бизнес-центры',          icon: 'Building2' },
  { key: 'park',            label: 'Парки и скверы',          icon: 'Trees' },
  { key: 'school',          label: 'Школы',                  icon: 'GraduationCap' },
  { key: 'hospital',        label: 'Больницы и клиники',      icon: 'Hospital' },
];

interface StatsItem {
  infra_type: string;
  cnt: number;
  last_loaded: string;
}

interface Stats {
  total: number;
  by_type: StatsItem[];
}

interface LoadResult {
  results: { type: string; status: string; loaded?: number; error?: string }[];
  total_in_db: Record<string, number>;
}

export default function SiteHealthGeo() {
  const [stats, setStats]           = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState<string[]>([]);
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(OSM_TYPES.map(t => t.key));

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const r = await fetch(`${GEO_URL}?action=infra_stats`).then(r => r.json());
      setStats(r);
    } catch {
      toast.error('Не удалось загрузить статистику');
    } finally {
      setStatsLoading(false);
    }
  };

  const runOsmLoad = async (types?: string[]) => {
    const typesToLoad = types || selectedTypes;
    setLoadingTypes(typesToLoad);
    setLoadResult(null);
    try {
      toast.info('Загрузка данных OSM... (~30–60 сек)');
      const r = await fetch(GEO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'osm_load', types: typesToLoad }),
      }).then(r => r.json());
      setLoadResult(r);
      const loaded = r.results?.reduce((s: number, x: { loaded?: number }) => s + (x.loaded || 0), 0) || 0;
      toast.success(`Загружено ${loaded} объектов из OpenStreetMap`);
      loadStats();
    } catch {
      toast.error('Ошибка загрузки OSM');
    } finally {
      setLoadingTypes([]);
    }
  };

  const toggleType = (key: string) => {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-4">

      {/* Заголовок */}
      <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
            <Icon name="MapPin" size={20} className="text-brand-blue" />
          </div>
          <div>
            <div className="font-display font-700 text-base">Инфраструктура Краснодара (OSM)</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Данные OpenStreetMap используются для скоринга локации объектов.
              Загрузка бесплатная, без ключей API.
            </div>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display font-700 text-base">Текущее состояние базы</div>
          <button
            onClick={loadStats}
            disabled={statsLoading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name={statsLoading ? 'Loader2' : 'RefreshCw'} size={14}
              className={statsLoading ? 'animate-spin' : ''} />
            Обновить
          </button>
        </div>

        {!stats && !statsLoading && (
          <div className="text-sm text-muted-foreground py-2">
            Нажмите «Обновить» чтобы увидеть статистику
          </div>
        )}

        {statsLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Icon name="Loader2" size={14} className="animate-spin" /> Загрузка...
          </div>
        )}

        {stats && (
          <>
            <div className="text-2xl font-display font-800 text-brand-blue mb-4">
              {stats.total.toLocaleString('ru')}
              <span className="text-sm font-normal text-muted-foreground ml-2">объектов в базе</span>
            </div>
            {stats.total === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 flex items-start gap-2">
                <Icon name="AlertTriangle" size={16} className="flex-shrink-0 mt-0.5" />
                База пуста. Загрузите данные OSM — скоринг локации не работает без них.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {stats.by_type.map(item => {
                  const cfg = OSM_TYPES.find(t => t.key === item.infra_type);
                  return (
                    <div key={item.infra_type}
                      className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-xl">
                      <Icon name={cfg?.icon || 'MapPin'} size={14} className="text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground truncate">{cfg?.label || item.infra_type}</div>
                        <div className="font-semibold text-sm">{item.cnt}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Загрузка OSM */}
      <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
        <div className="font-display font-700 text-base mb-1">Загрузить / обновить данные OSM</div>
        <div className="text-sm text-muted-foreground mb-4">
          Выберите типы объектов для загрузки. Данные берутся из OpenStreetMap — актуальны для Краснодара.
        </div>

        {/* Чекбоксы типов */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          {OSM_TYPES.map(t => {
            const checked = selectedTypes.includes(t.key);
            const isLoading = loadingTypes.includes(t.key);
            return (
              <label key={t.key}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition
                  ${checked ? 'border-brand-blue bg-brand-blue/5' : 'border-border bg-muted/20 hover:bg-muted/40'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleType(t.key)}
                  className="accent-brand-blue"
                  disabled={loadingTypes.length > 0}
                />
                <Icon name={isLoading ? 'Loader2' : t.icon} size={14}
                  className={`flex-shrink-0 ${isLoading ? 'animate-spin text-brand-blue' : checked ? 'text-brand-blue' : 'text-muted-foreground'}`} />
                <span className="text-sm truncate">{t.label}</span>
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => runOsmLoad()}
            disabled={loadingTypes.length > 0 || selectedTypes.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm hover:bg-brand-blue/90 transition disabled:opacity-50"
          >
            <Icon name={loadingTypes.length > 0 ? 'Loader2' : 'Download'} size={16}
              className={loadingTypes.length > 0 ? 'animate-spin' : ''} />
            {loadingTypes.length > 0
              ? `Загружаю ${loadingTypes.length} типов...`
              : `Загрузить выбранные (${selectedTypes.length})`}
          </button>
          <button
            onClick={() => {
              const all = OSM_TYPES.map(t => t.key);
              setSelectedTypes(all);
              runOsmLoad(all);
            }}
            disabled={loadingTypes.length > 0}
            className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name="Globe" size={16} />
            Всё сразу
          </button>
        </div>
      </div>

      {/* Результат загрузки */}
      {loadResult && (
        <div className="bg-white rounded-2xl p-5 border border-border shadow-sm">
          <div className="font-display font-700 text-base mb-3 flex items-center gap-2">
            <Icon name="CheckCircle2" size={18} className="text-emerald-500" />
            Результат загрузки
          </div>
          <div className="space-y-1.5">
            {loadResult.results.map(r => (
              <div key={r.type}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm
                  ${r.status === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                <div className="flex items-center gap-2">
                  <Icon name={r.status === 'ok' ? 'Check' : 'X'} size={14} />
                  <span>{OSM_TYPES.find(t => t.key === r.type)?.label || r.type}</span>
                </div>
                <span className="font-semibold">
                  {r.status === 'ok' ? `+${r.loaded || 0}` : r.error?.slice(0, 40)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Итого в базе: {Object.values(loadResult.total_in_db).reduce((a, b) => a + b, 0)} объектов
          </div>
        </div>
      )}
    </div>
  );
}