import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';
import { PriceResult, COLOR_MAP, CATEGORIES, PREDICT_URL, LISTINGS_URL, fmtMoney } from './shared';

// ── Вкладка: Ценообразование ───────────────────────────────────────────────────

export default function PricingTab() {
  const [mode, setMode] = useState<'manual' | 'id'>('id');
  const [idInput, setIdInput] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [idErr, setIdErr] = useState('');
  const [loadedListing, setLoadedListing] = useState<{ id: number; title: string } | null>(null);
  const [form, setForm] = useState({ category: 'office', deal: 'rent', area: '', price: '', district: '' });
  const [result, setResult] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadById = async () => {
    const raw = idInput.trim();
    if (!raw) { setIdErr('Введите ID объекта'); return; }
    // Вычищаем любые символы, оставляем только цифры
    const id = raw.replace(/\D/g, '');
    if (!id) { setIdErr('ID должен содержать цифры'); return; }
    setIdLoading(true); setIdErr(''); setResult(null); setLoadedListing(null);
    try {
      // Публичный API возвращает {listing: {...}} или {error: '...'}
      // Для архивных/скрытых объектов используем admin API напрямую
      let obj: Record<string, unknown> | null = null;

      // Сначала пробуем публичный endpoint
      const pub = await fetch(`${LISTINGS_URL}?id=${id}`).then(r => r.json());
      if (pub.listing) {
        obj = pub.listing;
      } else {
        // Fallback: admin endpoint — умеет находить любые объекты включая архивные
        const adm = await req(`listings&id=${id}`);
        if (adm && adm.id) obj = adm;
        else if (adm && adm.listing) obj = adm.listing;
      }

      if (!obj || !obj.id) { setIdErr(`Объект #${id} не найден`); return; }

      setLoadedListing({ id: Number(obj.id), title: String(obj.title || `Объект #${obj.id}`) });
      setForm({
        category: String(obj.category || 'office'),
        deal: String(obj.deal || 'rent'),
        area: String(obj.area || ''),
        price: String(obj.price || ''),
        district: String(obj.district || ''),
      });
    } catch (e) { setIdErr(e instanceof Error ? e.message : 'Ошибка загрузки'); }
    finally { setIdLoading(false); }
  };

  const check = async () => {
    if (!form.area || !form.price) { toast.error('Введите площадь и цену'); return; }
    setLoading(true); setErr(''); setResult(null);
    try {
      const r = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mela_price_check', ...form, refresh: true }),
      }).then(r => r.json());
      if (r.error) { setErr(r.error); return; }
      setResult(r);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  };

  const v = result?.verdict;
  const c = v ? (COLOR_MAP[v.color] || COLOR_MAP.gray) : null;

  const marketMin = v?.market_min_price || 0;
  const marketMax = v?.market_max_price || 1;
  const userPrice = Number(form.price) || 0;
  const rangeWidth = marketMax - marketMin;
  const userPct = rangeWidth > 0 ? Math.max(0, Math.min(100, ((userPrice - marketMin) / rangeWidth) * 100)) : 50;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Icon name="Sparkles" size={18} className="text-purple-500" />
          AI-анализ рыночной цены
        </h3>

        {/* Переключатель режима */}
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
          {(['id', 'manual'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setResult(null); setErr(''); setIdErr(''); setLoadedListing(null); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${mode === m ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {m === 'id' ? 'По ID объекта' : 'Вручную'}
            </button>
          ))}
        </div>

        {/* Режим: по ID */}
        {mode === 'id' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">ID объекта из каталога</label>
                <input
                  value={idInput}
                  onChange={e => { setIdInput(e.target.value); setIdErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && loadById()}
                  placeholder="54 или #54 или ID-54"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button onClick={loadById} disabled={idLoading}
                  className="bg-muted border border-border text-foreground rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-60 hover:bg-muted/80 transition">
                  <Icon name={idLoading ? 'Loader2' : 'Search'} size={15} className={idLoading ? 'animate-spin' : ''} />
                  {idLoading ? 'Загрузка…' : 'Найти'}
                </button>
              </div>
            </div>
            {idErr && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{idErr}</div>}
            {loadedListing && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
                <Icon name="CheckCircle2" size={15} className="text-emerald-500 flex-shrink-0" />
                <span className="font-medium truncate">{loadedListing.title}</span>
                <span className="text-muted-foreground text-xs flex-shrink-0">#{loadedListing.id}</span>
              </div>
            )}
          </div>
        )}

        {/* Поля формы — показываем всегда в ручном режиме, или когда загружен объект */}
        {(mode === 'manual' || loadedListing) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white">
                {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Тип сделки</label>
              <select value={form.deal} onChange={e => setForm(f => ({ ...f, deal: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white">
                <option value="rent">Аренда</option>
                <option value="sale">Продажа</option>
                <option value="business">Готовый бизнес</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Район</label>
              <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                placeholder="Центральный" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Площадь, м²</label>
              <input type="number" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                placeholder="100" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Цена, ₽</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="500000" className="w-full border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button onClick={check} disabled={loading}
                className="w-full bg-brand-blue text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                <Icon name={loading ? 'Loader2' : 'Sparkles'} size={15} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Анализ…' : 'Проверить'}
              </button>
            </div>
          </div>
        )}

        {err && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</div>}
      </div>

      {result && v && c && (
        <div className="space-y-4">
          {/* Вердикт */}
          <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${c.badge}`}>
            <Icon name={c.icon} size={20} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">{v.label}{v.delta_pct !== 0 && ` (${v.delta_pct > 0 ? '+' : ''}${v.delta_pct.toFixed(0)}%)`}</div>
              <div className="text-sm opacity-80 mt-0.5">{v.comment}</div>
            </div>
          </div>

          {/* Визуализация диапазона */}
          {marketMin > 0 && marketMax > 0 && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <div className="text-sm font-semibold mb-3">Позиция в рыночном диапазоне</div>
              <div className="relative h-6 bg-gradient-to-r from-blue-100 via-emerald-100 to-red-100 rounded-full mb-1">
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-white shadow transition-all"
                  style={{ left: `calc(${userPct}% - 6px)` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Мин: {fmtMoney(marketMin)}</span>
                <span className="font-semibold text-foreground">Ваша: {fmtMoney(userPrice)}</span>
                <span>Макс: {fmtMoney(marketMax)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                {v.market_median_per_m2 && (
                  <div className="bg-muted/30 rounded-xl px-3 py-2">
                    <div className="text-xs text-muted-foreground">Медиана ₽/м²</div>
                    <div className="font-semibold">{v.market_median_per_m2.toLocaleString('ru')} ₽</div>
                  </div>
                )}
                {v.user_price_per_m2 && (
                  <div className="bg-muted/30 rounded-xl px-3 py-2">
                    <div className="text-xs text-muted-foreground">Ваша ₽/м²</div>
                    <div className="font-semibold">{v.user_price_per_m2.toLocaleString('ru')} ₽</div>
                  </div>
                )}
              </div>
              {v.suggested_price && (
                <div className="mt-3 flex items-center justify-between bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Рекомендованная цена</div>
                    <div className="font-semibold text-brand-blue">{fmtMoney(v.suggested_price)}</div>
                  </div>
                  <Icon name="Wand2" size={18} className="text-brand-blue opacity-50" />
                </div>
              )}
            </div>
          )}

          {/* Аналоги */}
          {result.analogs.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Icon name="Building2" size={15} className="text-muted-foreground" />
                Аналоги на рынке ({result.analogs_count})
              </div>
              <div className="grid gap-2">
                {result.analogs.slice(0, 5).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted/20 rounded-xl px-3 py-2">
                    <div>
                      <span className="font-medium">{fmtMoney(a.price)}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{a.area} м²</span>
                      {a.district && <span className="text-muted-foreground ml-2 text-xs">· {a.district}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.price_per_m2.toLocaleString('ru')} ₽/м²</div>
                  </div>
                ))}
              </div>
              {result.sources.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {result.sources.map(s => (
                    <span key={s} className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
