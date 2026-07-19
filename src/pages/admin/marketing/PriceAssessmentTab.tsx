import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';
import { PriceResult, COLOR_MAP, CATEGORIES, PREDICT_URL, LISTINGS_URL, fmtMoney } from './shared';
import PriceSignalsWidget from './price-market/PriceSignalsWidget';
import MarketCharts from './price-market/MarketCharts';
import MarketHeader from './price-market/MarketHeader';
import RefreshProgress from './price-market/RefreshProgress';
import ImportBlock from './price-market/ImportBlock';
import { useMarketData } from './price-market/useMarketData';

// ─────────────────────────────────────────────────────────────────────────────
// Секция: оценка конкретного объекта
// ─────────────────────────────────────────────────────────────────────────────

function PricePositionBar({ userPrice, marketMin, marketMax, suggested }: {
  userPrice: number; marketMin: number; marketMax: number; suggested?: number;
}) {
  const range = marketMax - marketMin || 1;
  const pct = Math.max(0, Math.min(100, ((userPrice - marketMin) / range) * 100));
  const sugPct = suggested ? Math.max(0, Math.min(100, ((suggested - marketMin) / range) * 100)) : null;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>Мин: {fmtMoney(marketMin)} ₽</span>
        <span>Макс: {fmtMoney(marketMax)} ₽</span>
      </div>
      <div className="relative h-4 bg-gradient-to-r from-emerald-100 via-amber-100 to-red-100 rounded-full overflow-visible">
        {/* Рекомендованная цена */}
        {sugPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-brand-blue opacity-50"
            style={{ left: `${sugPct}%` }}
          />
        )}
        {/* Маркер текущей цены */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-brand-blue shadow-md flex items-center justify-center z-10"
          style={{ left: `${pct}%` }}
        >
          <div className="w-2 h-2 rounded-full bg-brand-blue" />
        </div>
      </div>
      <div className="flex justify-between text-[10px] mt-1">
        <span className="text-emerald-600 font-semibold">Дёшево</span>
        <span className="text-muted-foreground">Рынок</span>
        <span className="text-red-500 font-semibold">Дорого</span>
      </div>
    </div>
  );
}

function AssessmentResult({ result, form }: { result: PriceResult; form: { price: string; area: string } }) {
  const v = result.verdict;
  const c = COLOR_MAP[v.color] || COLOR_MAP.gray;
  const userPrice = Number(form.price);
  const marketMin = v.market_min_price || 0;
  const marketMax = v.market_max_price || 1;

  return (
    <div className="space-y-4 mt-4">
      {/* Вердикт */}
      <div className={`rounded-2xl border-2 p-4 ${c.badge}`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.badge}`}>
            <Icon name={c.icon} size={20} />
          </div>
          <div>
            <div className="font-bold text-base">{v.label}</div>
            {v.delta_pct !== 0 && (
              <div className="text-sm font-semibold">
                {v.delta_pct > 0 ? `+${v.delta_pct}%` : `${v.delta_pct}%`} от рынка
              </div>
            )}
          </div>
          {v.suggested_price && (
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">Рекомендованная</div>
              <div className="font-bold text-lg">{fmtMoney(v.suggested_price)} ₽</div>
            </div>
          )}
        </div>
        {v.comment && <p className="text-sm opacity-80">{v.comment}</p>}
      </div>

      {/* Позиция на рынке */}
      {marketMax > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Icon name="Target" size={15} className="text-brand-blue" />
            Позиция цены
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Ваша цена', value: `${fmtMoney(userPrice)} ₽`, bold: true },
              { label: 'Медиана рынка', value: v.market_median_per_m2 ? `${fmtMoney(v.market_median_per_m2)} ₽/м²` : '—' },
              { label: 'Аналогов', value: result.analogs_count },
            ].map(m => (
              <div key={m.label} className="text-center">
                <div className={`text-base ${m.bold ? 'font-bold text-brand-blue' : 'font-semibold'}`}>{m.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
          <PricePositionBar
            userPrice={userPrice}
            marketMin={marketMin}
            marketMax={marketMax}
            suggested={v.suggested_price}
          />
        </div>
      )}

      {/* Аналоги */}
      {result.analogs && result.analogs.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Icon name="Building2" size={15} className="text-brand-blue" />
            Аналоги на рынке ({result.analogs.length})
          </div>
          <div className="space-y-2">
            {result.analogs.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-semibold shrink-0">{a.source}</span>
                  {a.district && <span className="text-xs text-muted-foreground truncate">{a.district}</span>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="font-semibold">{fmtMoney(a.price)} ₽</div>
                  <div className="text-[10px] text-muted-foreground">{a.area} м² · {fmtMoney(a.price_per_m2)} ₽/м²</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Основной компонент
// ─────────────────────────────────────────────────────────────────────────────

type Section = 'assess' | 'signals' | 'charts' | 'import';

const SECTIONS: { id: Section; label: string; icon: string; desc: string }[] = [
  { id: 'assess', label: 'Оценить объект', icon: 'Sparkles', desc: 'AI-анализ цены по рынку' },
  { id: 'signals', label: 'Ценовые сигналы', icon: 'TrendingUp', desc: 'Изменения за 2 недели' },
  { id: 'charts', label: 'Графики рынка', icon: 'BarChart3', desc: 'Тренды, сравнение, тепловая карта' },
  { id: 'import', label: 'Импорт данных', icon: 'Upload', desc: 'Загрузить XLSX из агрегаторов' },
];

export default function PriceAssessmentTab() {
  const [section, setSection] = useState<Section>('assess');

  // ── Оценка объекта ──
  const [mode, setMode] = useState<'id' | 'manual'>('id');
  const [idInput, setIdInput] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [idErr, setIdErr] = useState('');
  const [loadedListing, setLoadedListing] = useState<{ id: number; title: string } | null>(null);
  const [form, setForm] = useState({ category: 'office', deal: 'rent', area: '', price: '', district: '' });
  const [result, setResult] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // ── Рынок ──
  const {
    data: marketData, loading: marketLoading, viewMode, filterDeal, filterDistrict, filterDays,
    selectedCats, refreshState, assigningDistricts, assignProgress, aggregating,
    trendData, supplyData, compareData, heatmapData, heatIndexData, dynamicDistricts,
    setViewMode, setFilterDeal, setFilterDistrict, setFilterDays,
    toggleCat, runBatchChain, runAutoAssign, runAggregate,
  } = useMarketData();

  const loadById = useCallback(async () => {
    const raw = idInput.trim();
    if (!raw) { setIdErr('Введите ID'); return; }
    const id = raw.replace(/\D/g, '');
    if (!id) { setIdErr('ID должен содержать цифры'); return; }
    setIdLoading(true); setIdErr(''); setResult(null); setLoadedListing(null);
    try {
      let obj: Record<string, unknown> | null = null;
      const pub = await fetch(`${LISTINGS_URL}?id=${id}`).then(r => r.json());
      if (pub.listing) { obj = pub.listing; }
      else {
        const adm = await req(`listings&id=${id}`);
        if (adm?.id) obj = adm;
        else if (adm?.listing) obj = adm.listing;
      }
      if (!obj?.id) { setIdErr(`Объект #${id} не найден`); return; }
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
  }, [idInput]);

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

  return (
    <div className="space-y-4">

      {/* ── Навигация секций ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-2xl border p-3 text-left transition ${
              section === s.id
                ? 'border-brand-blue bg-brand-blue/5'
                : 'border-border bg-white hover:border-brand-blue/40'
            }`}
          >
            <div className={`flex items-center gap-2 mb-1 ${section === s.id ? 'text-brand-blue' : 'text-foreground'}`}>
              <Icon name={s.icon} size={15} />
              <span className="font-semibold text-sm">{s.label}</span>
            </div>
            <div className="text-xs text-muted-foreground">{s.desc}</div>
          </button>
        ))}
      </div>

      {/* ── СЕКЦИЯ: ОЦЕНИТЬ ОБЪЕКТ ── */}
      {section === 'assess' && (
        <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="Sparkles" size={18} className="text-purple-500" />
            <h3 className="font-bold text-base">AI-оценка рыночной цены</h3>
          </div>

          {/* Режим */}
          <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
            {(['id', 'manual'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setResult(null); setErr(''); setIdErr(''); setLoadedListing(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mode === m ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {m === 'id' ? 'По ID объекта' : 'Ввести вручную'}
              </button>
            ))}
          </div>

          {/* Поиск по ID */}
          {mode === 'id' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">ID объекта из каталога</label>
                  <input
                    value={idInput}
                    onChange={e => { setIdInput(e.target.value); setIdErr(''); }}
                    onKeyDown={e => e.key === 'Enter' && loadById()}
                    placeholder="54 или #54"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                  />
                </div>
                <div className="flex items-end">
                  <button onClick={loadById} disabled={idLoading}
                    className="border border-border bg-muted text-foreground rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-60 hover:bg-muted/80 transition">
                    <Icon name={idLoading ? 'Loader2' : 'Search'} size={15} className={idLoading ? 'animate-spin' : ''} />
                    {idLoading ? 'Поиск…' : 'Найти'}
                  </button>
                </div>
              </div>
              {idErr && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{idErr}</div>}
              {loadedListing && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
                  <Icon name="CheckCircle2" size={15} className="text-emerald-500 shrink-0" />
                  <span className="font-medium truncate">{loadedListing.title}</span>
                  <span className="text-muted-foreground text-xs shrink-0">#{loadedListing.id}</span>
                </div>
              )}
            </div>
          )}

          {/* Форма параметров */}
          {(mode === 'manual' || loadedListing) && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30">
                    {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип сделки</label>
                  <select value={form.deal} onChange={e => setForm(f => ({ ...f, deal: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30">
                    <option value="rent">Аренда</option>
                    <option value="sale">Продажа</option>
                    <option value="business">Готовый бизнес</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Район</label>
                  <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                    placeholder="Центральный" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Площадь, м²</label>
                  <input type="number" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                    placeholder="100" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ваша цена, ₽</label>
                  <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="500000" className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
                </div>
                <div className="flex items-end">
                  <button onClick={check} disabled={loading}
                    className="w-full bg-brand-blue text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-brand-blue/90 transition">
                    <Icon name={loading ? 'Loader2' : 'Sparkles'} size={15} className={loading ? 'animate-spin' : ''} />
                    {loading ? 'Анализирую…' : 'Оценить'}
                  </button>
                </div>
              </div>

              {/* Подсказка */}
              {!result && !loading && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2.5">
                  <Icon name="Info" size={13} className="shrink-0 mt-0.5" />
                  <span>AI сравнит вашу цену с актуальными предложениями рынка по схожим объектам в выбранном районе и даст рекомендацию.</span>
                </div>
              )}
            </div>
          )}

          {/* Ошибка */}
          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl flex items-center gap-2">
              <Icon name="AlertCircle" size={14} className="shrink-0" /> {err}
            </div>
          )}

          {/* Результат */}
          {result && <AssessmentResult result={result} form={form} />}

          {/* Пустое состояние */}
          {!loadedListing && mode === 'id' && !idLoading && !result && (
            <div className="text-center py-10 text-muted-foreground">
              <Icon name="Search" size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Введите ID объекта из каталога или переключитесь на ручной ввод</p>
            </div>
          )}
        </div>
      )}

      {/* ── СЕКЦИЯ: ЦЕНОВЫЕ СИГНАЛЫ ── */}
      {section === 'signals' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Icon name="TrendingUp" size={18} className="text-amber-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">Ценовые сигналы рынка</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Автоматическое сравнение двухнедельных срезов цен — показывает значимые изменения ±3% и аномалии.
                </div>
              </div>
            </div>
          </div>
          <PriceSignalsWidget />
        </div>
      )}

      {/* ── СЕКЦИЯ: ГРАФИКИ РЫНКА ── */}
      {section === 'charts' && (
        <div className="space-y-3">
          <MarketHeader
            data={marketData}
            loading={marketLoading}
            refreshing={refreshState.running}
            assigningDistricts={assigningDistricts}
            assignProgress={assignProgress}
            aggregating={aggregating}
            filterDeal={filterDeal}
            filterDistrict={filterDistrict}
            filterDays={filterDays}
            dynamicDistricts={dynamicDistricts}
            onRefresh={() => runBatchChain(true)}
            onAutoAssign={runAutoAssign}
            onAggregate={runAggregate}
            onDealChange={setFilterDeal}
            onDistrictChange={setFilterDistrict}
            onDaysChange={setFilterDays}
          />

          {(refreshState.running || refreshState.finishedAt) && (
            <RefreshProgress state={refreshState} onStart={() => runBatchChain(true)} />
          )}

          <PriceSignalsWidget />

          <MarketCharts
            data={marketData}
            loading={marketLoading}
            refreshing={refreshState.running}
            viewMode={viewMode}
            filterDeal={filterDeal}
            filterDistrict={filterDistrict}
            selectedCats={selectedCats}
            trendData={trendData}
            supplyData={supplyData}
            compareData={compareData}
            heatmapData={heatmapData}
            heatIndexData={heatIndexData}
            onSwitchView={setViewMode}
            onToggleCat={toggleCat}
            onCollectData={() => runBatchChain(true)}
          />
        </div>
      )}

      {/* ── СЕКЦИЯ: ИМПОРТ ── */}
      {section === 'import' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center shrink-0">
                <Icon name="Upload" size={18} className="text-brand-blue" />
              </div>
              <div>
                <div className="font-semibold text-sm">Импорт рыночных данных</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Загружайте XLSX-выгрузки из ЦИАН, Авито, ДомКлик — данные пополняют базу для точных оценок.
                </div>
              </div>
            </div>
          </div>
          <ImportBlock />
        </div>
      )}

    </div>
  );
}