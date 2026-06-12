import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Listing } from './types';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface Verdict {
  label: string;
  color: 'red' | 'amber' | 'green' | 'emerald' | 'gray';
  delta_pct: number;
  user_price_per_m2?: number;
  market_median_per_m2?: number;
  market_min_price?: number;
  market_max_price?: number;
  suggested_price?: number;
  comment: string;
}

interface Analog {
  source: string;
  price: number;
  area: number;
  price_per_m2: number;
  district?: string;
  url?: string;
}

interface MelaResult {
  verdict: Verdict;
  analogs_count: number;
  analogs: Analog[];
  sources: string[];
  used_gpt_fallback: boolean;
  search_level?: string;
}

const COLOR_BADGE: Record<string, string> = {
  red:     'bg-red-100 text-red-700 border-red-200',
  amber:   'bg-amber-100 text-amber-700 border-amber-200',
  green:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  emerald: 'bg-blue-100 text-blue-700 border-blue-200',
  gray:    'bg-slate-100 text-slate-600 border-slate-200',
};

const ICON_BY_COLOR: Record<string, string> = {
  red: 'TrendingUp',
  amber: 'AlertTriangle',
  green: 'CheckCircle2',
  emerald: 'TrendingDown',
  gray: 'HelpCircle',
};

function fmtMoney(n?: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.00$/, '')} млн ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс ₽`;
  return `${Math.round(n).toLocaleString('ru')} ₽`;
}

interface Props {
  editing: Partial<Listing>;
  onApplySuggested?: (price: number) => void;
}

export default function MelaPriceCheck({ editing, onApplySuggested }: Props) {
  const [result, setResult] = useState<MelaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canCheck = !!(editing.area && editing.price && editing.category && editing.deal);

  const fetchVerdict = (refresh = false) => {
    if (!canCheck) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      setError('');
      fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mela_price_check',
          category: editing.category,
          deal: editing.deal,
          area: editing.area,
          price: editing.price,
          address: editing.address || '',
          district: editing.district || '',
          floor: editing.floor || null,
          condition: editing.condition || '',
          refresh,
        }),
      })
        .then(r => r.json())
        .then((d: MelaResult & { error?: string }) => {
          if (d.error) {
            setError(d.error);
            return;
          }
          setResult(d);
        })
        .catch(e => setError(e instanceof Error ? e.message : 'Ошибка сети'))
        .finally(() => setLoading(false));
    }, refresh ? 0 : 600);
  };

  // Автозапуск при изменении ключевых полей
  useEffect(() => {
    fetchVerdict(false);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.area, editing.price, editing.category, editing.deal, editing.district, editing.condition]);

  if (!canCheck) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-slate-500 text-[11px]">
        <Icon name="Sparkles" size={11} />
        Виртуальный брокер: укажите цену и площадь
      </div>
    );
  }

  if (loading && !result) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px]">
        <Icon name="Loader2" size={11} className="animate-spin" />
        Виртуальный брокер анализирует…
      </div>
    );
  }

  if (error && !result) {
    return (
      <button type="button" onClick={() => fetchVerdict(true)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[11px] hover:bg-red-100">
        <Icon name="AlertCircle" size={11} />
        Ошибка анализа · повторить
      </button>
    );
  }

  if (!result) return null;

  const v = result.verdict;
  const colorClass = COLOR_BADGE[v.color] || COLOR_BADGE.gray;
  const iconName = ICON_BY_COLOR[v.color] || 'HelpCircle';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${colorClass}`}
        title="Анализ цены Виртуальным брокером"
      >
        <Icon name={iconName} size={12} />
        <span className="hidden sm:inline">{v.label}</span>
        {v.delta_pct !== 0 && (
          <span className="opacity-80">
            {v.delta_pct > 0 ? '+' : ''}{v.delta_pct.toFixed(0)}%
          </span>
        )}
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={11} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-full mt-1.5 w-[min(420px,90vw)] bg-white rounded-xl shadow-xl border border-border p-3 space-y-2.5 text-xs">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center flex-shrink-0">
              <Icon name="Sparkles" size={14} className="text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Виртуальный брокер · анализ цены</div>
              <div className="text-muted-foreground text-[11px]">{v.comment}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-0.5">
              <Icon name="X" size={13} />
            </button>
          </div>

          {/* Рыночный диапазон */}
          {v.market_min_price && v.market_max_price && (
            <div className="bg-muted/40 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Рыночный диапазон</span>
                <span className="font-semibold">
                  {fmtMoney(v.market_min_price)} – {fmtMoney(v.market_max_price)}
                </span>
              </div>
              {v.market_median_per_m2 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Медиана ₽/м²</span>
                  <span className="font-semibold">{v.market_median_per_m2.toLocaleString('ru')} ₽</span>
                </div>
              )}
              {v.user_price_per_m2 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ваша цена ₽/м²</span>
                  <span className={`font-semibold ${
                    v.color === 'red' ? 'text-red-600' :
                    v.color === 'emerald' ? 'text-blue-600' : 'text-emerald-600'
                  }`}>
                    {v.user_price_per_m2.toLocaleString('ru')} ₽
                  </span>
                </div>
              )}
            </div>
          )}

          {v.suggested_price && onApplySuggested && (
            <button type="button"
              onClick={() => { onApplySuggested(v.suggested_price!); setOpen(false); }}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-blue text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90">
              <Icon name="Wand2" size={12} />
              Применить рекомендованную цену ({fmtMoney(v.suggested_price)})
            </button>
          )}

          {/* Уровень поиска + источники */}
          <div className="flex flex-wrap items-center gap-1.5">
            {result.search_level && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1">
                <Icon name="MapPin" size={9} />
                {result.search_level}
              </span>
            )}
            {result.sources.map(s => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{s}</span>
            ))}
            <span className="text-muted-foreground ml-auto">{result.analogs_count} аналогов</span>
          </div>

          {/* Аналоги */}
          {result.analogs.length > 0 && (
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1 -mr-1">
              {result.analogs.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{Math.round(a.area)} м² {a.district ? `· ${a.district}` : ''}</div>
                    <div className="text-muted-foreground text-[10px]">{a.source}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{fmtMoney(a.price)}</div>
                    <div className="text-muted-foreground text-[10px]">{a.price_per_m2.toLocaleString('ru')} ₽/м²</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={() => fetchVerdict(true)} disabled={loading}
            className="w-full text-[11px] text-brand-blue hover:underline inline-flex items-center justify-center gap-1 disabled:opacity-50">
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={10} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Обновляю…' : 'Пересчитать'}
          </button>
        </div>
      )}
    </div>
  );
}