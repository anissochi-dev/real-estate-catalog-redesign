import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Listing, PARKING, ENTRANCE, perM2 } from './types';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface PredictHint {
  market_price: number | null;
  price_per_m2_median: number | null;
  price_assessment: { label: string; color: string; delta_pct: number };
  payback_months: number | null;
  comparables_count: number;
  data_source: string;
}

const ASSESS_COLOR: Record<string, string> = {
  emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  green:   'text-green-600 bg-green-50 border-green-200',
  blue:    'text-blue-600 bg-blue-50 border-blue-200',
  amber:   'text-amber-600 bg-amber-50 border-amber-200',
  red:     'text-red-600 bg-red-50 border-red-200',
  gray:    'text-slate-500 bg-slate-50 border-slate-200',
};

function fmt(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' млн ₽';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс. ₽';
  return n.toLocaleString('ru') + ' ₽';
}

function usePriceHint(category: string, deal: string, area: number, price: number, district: string) {
  const [hint, setHint] = useState<PredictHint | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!area || !category || !deal) { setHint(null); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, deal, area, price, district }),
      })
        .then(r => r.json())
        .then(d => { if (!d.error) setHint(d as PredictHint); })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [category, deal, area, price, district]);

  return { hint, loading };
}

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

export default function ListingEditorPriceSection({ editing, setEditing, errors = {}, setErrors }: Props) {
  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const { hint, loading: hintLoading } = usePriceHint(
    editing.category || '',
    editing.deal || '',
    Number(editing.area || 0),
    Number(editing.price || 0),
    editing.district || '',
  );

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Цена, ₽ *</label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('price')}`}
            value={editing.price || ''} onChange={e => { setEditing({ ...editing, price: +e.target.value }); setErrors?.(v => ({ ...v, price: false })); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Площадь, м² *</label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('area')}`}
            value={editing.area || ''} onChange={e => { setEditing({ ...editing, area: +e.target.value }); setErrors?.(v => ({ ...v, area: false })); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Единица цены</label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.price_unit || 'total'}
            onChange={e => setEditing({ ...editing, price_unit: e.target.value })}>
            <option value="total">За весь объект</option>
            <option value="m2">За м²</option>
            <option value="sotka">За сотку</option>
          </select>
        </div>
      </div>

      {editing.price && editing.area ? (
        <div className="text-sm bg-muted/40 rounded-lg p-3">
          За м²: <b>{perM2(+editing.price, +editing.area).toLocaleString('ru')} ₽</b>
          {editing.price_unit === 'total' && ' (рассчитано из цены за объект)'}
        </div>
      ) : null}

      {editing.area && editing.category && editing.deal && (
        <div className="rounded-xl border bg-slate-50 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-600 mb-2">
            <Icon name="TrendingUp" size={12} />
            Анализ рынка
            {hintLoading && <Icon name="Loader2" size={11} className="animate-spin text-slate-400 ml-1" />}
          </div>
          {hint ? (
            <div className="flex flex-wrap gap-2">
              {editing.price && hint.price_assessment && (
                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${ASSESS_COLOR[hint.price_assessment.color] || ASSESS_COLOR.gray}`}>
                  {hint.price_assessment.label}
                  {hint.price_assessment.delta_pct !== 0 && (
                    <> {hint.price_assessment.delta_pct > 0 ? '+' : ''}{hint.price_assessment.delta_pct}%</>
                  )}
                </span>
              )}
              {hint.market_price && (
                <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px]">
                  Рынок: <b>{fmt(hint.market_price)}</b>
                </span>
              )}
              {hint.price_per_m2_median && (
                <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px]">
                  Медиана ₽/м²: <b>{hint.price_per_m2_median.toLocaleString('ru')} ₽</b>
                </span>
              )}
              {hint.payback_months && (editing.deal === 'sale' || editing.deal === 'business') && (
                <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px]">
                  Окупаемость: <b>
                    {hint.payback_months < 12
                      ? `${hint.payback_months} мес.`
                      : `${Math.floor(hint.payback_months / 12)} лет`}
                  </b>
                </span>
              )}
              <span className="text-slate-400 text-[10px] self-center">
                {hint.comparables_count > 0
                  ? `по ${hint.comparables_count} аналогам`
                  : 'нормативы рынка'}
              </span>
            </div>
          ) : !hintLoading ? (
            <span className="text-slate-400">Укажите цену и площадь для анализа</span>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Этаж *</label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('floor')}`}
            value={editing.floor ?? ''} onChange={e => { setEditing({ ...editing, floor: e.target.value === '' ? null : +e.target.value }); setErrors?.(v => ({ ...v, floor: false })); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Этажность *</label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('total_floors')}`}
            value={editing.total_floors ?? ''} onChange={e => { setEditing({ ...editing, total_floors: e.target.value === '' ? null : +e.target.value }); setErrors?.(v => ({ ...v, total_floors: false })); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Комнат</label>
          <input type="number" min={0} max={99} className="w-full px-3 py-2 border rounded-lg"
            placeholder="—"
            value={(editing as Record<string,unknown>).rooms != null ? String((editing as Record<string,unknown>).rooms) : ''}
            onChange={e => setEditing({ ...editing, rooms: e.target.value === '' ? null : +e.target.value } as typeof editing)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Парковка</label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.parking || 'none'}
            onChange={e => setEditing({ ...editing, parking: e.target.value })}>
            {PARKING.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Вход</label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.entrance || 'street'}
            onChange={e => setEditing({ ...editing, entrance: e.target.value })}>
            {ENTRANCE.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Комиссия брокера</label>
          <input type="text" className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 3% или 50 000 ₽"
            value={(editing as Record<string,unknown>).broker_commission as string || ''}
            onChange={e => setEditing({ ...editing, broker_commission: e.target.value } as typeof editing)} />
        </div>
      </div>
    </>
  );
}