import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
const GEO_SEARCH_URL = 'https://functions.poehali.dev/94f11c58-4ec2-4d37-9918-69d86bfb02b8';

interface InfraNearby {
  id: number;
  infra_type: string;
  name: string;
  lat: number;
  lng: number;
  distance_m: number;
}

interface BreakdownItem {
  label: string;
  score: number;
  max: number;
  nearest_name: string | null;
  nearest_dist_m: number | null;
}

interface ScoreData {
  score: number;
  label: string;
  breakdown: Record<string, BreakdownItem>;
  infra_nearby: InfraNearby[];
  note?: string;
  cached?: boolean;
}

// Иконки по типу инфраструктуры
const INFRA_ICONS: Record<string, string> = {
  tram_stop:       'Tram',
  bus_stop:        'Bus',
  subway_entrance: 'Train',
  railway_station: 'TrainFront',
  shopping_mall:   'ShoppingBag',
  supermarket:     'ShoppingCart',
  market:          'Store',
  business_center: 'Building2',
  park:            'Trees',
  school:          'GraduationCap',
  hospital:        'Hospital',
};

const INFRA_COLORS: Record<string, string> = {
  tram_stop:       'bg-blue-100 text-blue-700',
  bus_stop:        'bg-sky-100 text-sky-700',
  subway_entrance: 'bg-indigo-100 text-indigo-700',
  railway_station: 'bg-violet-100 text-violet-700',
  shopping_mall:   'bg-orange-100 text-orange-700',
  supermarket:     'bg-amber-100 text-amber-700',
  market:          'bg-yellow-100 text-yellow-700',
  business_center: 'bg-cyan-100 text-cyan-700',
  park:            'bg-green-100 text-green-700',
  school:          'bg-purple-100 text-purple-700',
  hospital:        'bg-red-100 text-red-700',
};

function scoreColor(score: number) {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-brand-blue';
  if (score >= 30) return 'text-amber-600';
  return 'text-muted-foreground';
}

function scoreRingColor(score: number) {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#2563eb';
  if (score >= 30) return '#d97706';
  return '#94a3b8';
}

function formatDist(m: number) {
  return m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1)} км`;
}

function formatWalk(m: number) {
  const min = Math.round(m / 80);
  return min < 1 ? '~1 мин' : `~${min} мин`;
}

// SVG-кольцо прогресса
function ScoreRing({ score }: { score: number }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = scoreRingColor(score);
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="flex-shrink-0">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${fill} ${circ}`} strokeDashoffset={circ / 4}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="40" y="44" textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>{Math.round(score)}</text>
    </svg>
  );
}

// Полоска фактора
function FactorBar({ item }: { item: BreakdownItem }) {
  const pct = item.max > 0 ? Math.min((item.score / item.max) * 100, 100) : 0;
  const hasData = item.nearest_dist_m !== null;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-28 flex-shrink-0 text-xs text-muted-foreground truncate">{item.label}</div>
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: pct >= 66 ? '#10b981' : pct >= 33 ? '#3b82f6' : '#94a3b8' }}
        />
      </div>
      <div className="w-20 text-right flex-shrink-0">
        {hasData ? (
          <span className="text-xs text-foreground/70">{formatDist(item.nearest_dist_m!)}</span>
        ) : (
          <span className="text-xs text-muted-foreground/50">нет данных</span>
        )}
      </div>
    </div>
  );
}

interface Props {
  listingId: number;
  lat: number;
  lng: number;
  category: string;
}

export default function LocationScoreWidget({ listingId, lat, lng, category }: Props) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'score' | 'nearby'>('score');

  useEffect(() => {
    if (!lat || !lng) return;
    setLoading(true);
    fetch(GEO_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'location_score', id: listingId, lat, lng, category }),
    })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [listingId, lat, lng, category]);

  if (!lat || !lng) return null;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
        <div className="h-4 bg-muted rounded w-40 mb-3" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (!data || data.note) {
    return null; // нет данных OSM — не показываем виджет
  }

  const breakdownList = Object.values(data.breakdown || {}).sort((a, b) => b.score - a.score);
  const topNeaby = (data.infra_nearby || []).slice(0, 8);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Шапка */}
      <div
        className="p-5 flex items-center gap-4 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <ScoreRing score={data.score} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-700 text-base flex items-center gap-2">
            <Icon name="MapPin" size={16} className="text-brand-blue flex-shrink-0" />
            Скоринг локации
          </div>
          <div className={`font-display font-800 text-lg mt-0.5 ${scoreColor(data.score)}`}>
            {data.label}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Нажмите чтобы {expanded ? 'свернуть' : 'увидеть детали'}
          </div>
        </div>
        <Icon
          name={expanded ? 'ChevronUp' : 'ChevronDown'}
          size={18}
          className="text-muted-foreground flex-shrink-0"
        />
      </div>

      {/* Развёрнутая часть */}
      {expanded && (
        <div className="border-t border-border">
          {/* Вкладки */}
          <div className="flex border-b border-border px-5">
            {(['score', 'nearby'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? 'border-brand-blue text-brand-blue'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'score' ? 'Факторы' : 'Рядом'}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'score' && (
              <div>
                <div className="text-xs text-muted-foreground mb-3">
                  Оценка на основе данных OpenStreetMap · {category && `для категории «${category}»`}
                </div>
                {breakdownList.map(item => (
                  <FactorBar key={item.label} item={item} />
                ))}
              </div>
            )}

            {tab === 'nearby' && (
              <div>
                <div className="text-xs text-muted-foreground mb-3">
                  Объекты инфраструктуры в радиусе 2 км
                </div>
                {topNeaby.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Нет данных об инфраструктуре
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {topNeaby.map(obj => {
                      const iconName = INFRA_ICONS[obj.infra_type] || 'MapPin';
                      const colorCls = INFRA_COLORS[obj.infra_type] || 'bg-muted text-muted-foreground';
                      return (
                        <div key={obj.id} className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                            <Icon name={iconName} size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{obj.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDist(obj.distance_m)} · {formatWalk(obj.distance_m)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}