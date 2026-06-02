import { useState } from 'react';
import Icon from '@/components/ui/icon';
import type { ListingDetail } from '@/lib/api';

const AI_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';
const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface AnalyzeResult {
  price_analysis: string;
  liquidity: string;
  location_analysis: string;
  object_analysis: string;
  broker_recommendations: string[];
  improvements: string[];
  utp_titles: string[];
  suitable_for: string[];
  description: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  item: ListingDetail;
}

export default function PropertyAnalyzeModal({ open, onClose, item }: Props) {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'description'>('analysis');

  const run = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    // Сначала получаем рыночные данные
    let marketData: Record<string, unknown> = {};
    try {
      const pr = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mela_price_check',
          category: item.type,
          deal: item.deal,
          area: item.area,
          price: item.price,
          address: item.address || '',
          district: item.district || '',
          floor: item.floor || null,
          condition: item.condition || '',
        }),
      });
      const pd = await pr.json();
      if (pd?.verdict) {
        marketData = {
          median_per_m2: pd.verdict.market_median_per_m2,
          min_price: pd.verdict.market_min_price,
          max_price: pd.verdict.market_max_price,
          analogs_count: pd.analogs_count,
          verdict_label: pd.verdict.label,
          delta_pct: pd.verdict.delta_pct,
        };
      }
    } catch {
      // рыночные данные опциональны
    }

    // Запускаем полный анализ
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze_property',
          listing: {
            title: item.title,
            category: item.type,
            deal: item.deal,
            address: item.address,
            district: item.district,
            city: item.city,
            area: item.area,
            price: item.price,
            price_per_m2: item.pricePerM2,
            floor: item.floor,
            total_floors: item.totalFloors,
            condition: item.condition,
            ceiling_height: item.ceilingHeight,
            electricity_kw: item.electricityKw,
            utilities: item.utilities,
            parking: item.parking,
            tenant_name: item.tenantName,
            monthly_rent: item.monthlyRent,
            yearly_rent: item.yearlyRent,
            profit: item.profit,
            payback: item.payback,
            purpose: item.purpose,
            has_photos: !!(item.images?.length || item.image),
            photos_count: item.images?.length || (item.image ? 1 : 0),
          },
          market: marketData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка анализа');
      setResult(data);
      setActiveTab('analysis');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const copyDescription = () => {
    if (!result?.description) return;
    navigator.clipboard.writeText(result.description).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Icon name="Brain" size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-700 text-sm leading-tight">ИИ-анализ объекта</div>
            <div className="text-[10px] text-muted-foreground truncate">{item.title}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition flex-shrink-0">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!result && !loading && (
            <div className="p-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950/40 dark:to-indigo-950/40 flex items-center justify-center mx-auto mb-3">
                <Icon name="Sparkles" size={24} className="text-violet-500" />
              </div>
              <div className="font-display font-700 text-base mb-1">Полный анализ объекта</div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                ИИ проведёт комплексный анализ: сравнение цен с рынком, ликвидность, инфраструктура района,
                рекомендации брокеру, УТП и готовое описание.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-5 text-left">
                {[
                  { icon: 'TrendingUp', label: 'Анализ цены и рынка' },
                  { icon: 'MapPin', label: 'Инфраструктура района' },
                  { icon: 'Zap', label: 'Ликвидность объекта' },
                  { icon: 'Star', label: 'Рекомендации и УТП' },
                  { icon: 'Wrench', label: 'Улучшения и доработки' },
                  { icon: 'FileText', label: 'Готовое описание' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                    <Icon name={f.icon} size={13} className="text-violet-500 flex-shrink-0" />
                    {f.label}
                  </div>
                ))}
              </div>
              <button
                onClick={run}
                className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
              >
                <Icon name="Sparkles" size={15} />
                Запустить анализ
              </button>
            </div>
          )}

          {loading && (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin mx-auto mb-4" />
              <div className="font-display font-700 text-sm mb-1">Анализирую объект...</div>
              <div className="text-xs text-muted-foreground">
                Сравниваю цены, изучаю район, формирую рекомендации
              </div>
            </div>
          )}

          {error && (
            <div className="p-4">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 mb-3">
                {error}
              </div>
              <button onClick={run} className="w-full border border-border rounded-xl py-2.5 text-sm font-semibold hover:bg-muted transition">
                Попробовать ещё раз
              </button>
            </div>
          )}

          {result && (
            <div className="p-4 space-y-0">
              {/* Tabs */}
              <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-4">
                {([
                  { key: 'analysis', label: 'Анализ', icon: 'BarChart2' },
                  { key: 'description', label: 'Описание', icon: 'FileText' },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                      activeTab === t.key
                        ? 'bg-white dark:bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon name={t.icon} size={12} />
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab === 'analysis' && (
                <div className="space-y-3">
                  {/* Цена */}
                  {result.price_analysis && (
                    <Section icon="TrendingUp" title="Анализ цены" color="emerald">
                      {result.price_analysis}
                    </Section>
                  )}
                  {/* Ликвидность */}
                  {result.liquidity && (
                    <Section icon="Zap" title="Ликвидность" color="amber">
                      {result.liquidity}
                    </Section>
                  )}
                  {/* Район */}
                  {result.location_analysis && (
                    <Section icon="MapPin" title="Локация и инфраструктура" color="blue">
                      {result.location_analysis}
                    </Section>
                  )}
                  {/* Объект */}
                  {result.object_analysis && (
                    <Section icon="Building2" title="Анализ объекта" color="violet">
                      {result.object_analysis}
                    </Section>
                  )}
                  {/* Рекомендации брокеру */}
                  {result.broker_recommendations?.length > 0 && (
                    <ListSection icon="Star" title="Рекомендации брокеру" color="orange" items={result.broker_recommendations} />
                  )}
                  {/* Улучшения */}
                  {result.improvements?.length > 0 && (
                    <ListSection icon="Wrench" title="Что можно улучшить" color="rose" items={result.improvements} />
                  )}
                  {/* УТП */}
                  {result.utp_titles?.length > 0 && (
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon name="Pen" size={13} className="text-indigo-500" />
                        <span className="text-xs font-semibold text-foreground">Варианты названия (УТП)</span>
                      </div>
                      <div className="space-y-1">
                        {result.utp_titles.map((t, i) => (
                          <div key={i} className="text-xs text-foreground bg-white dark:bg-background rounded-lg px-3 py-2 border border-border">
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Подойдёт для */}
                  {result.suitable_for?.length > 0 && (
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon name="Target" size={13} className="text-teal-500" />
                        <span className="text-xs font-semibold text-foreground">Подойдёт для</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.suitable_for.map((s, i) => (
                          <span key={i} className="text-[11px] bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/40 rounded-lg px-2.5 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'description' && result.description && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Готовое описание</span>
                    <button
                      onClick={copyDescription}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      <Icon name={copied ? 'Check' : 'Copy'} size={12} className={copied ? 'text-emerald-500' : ''} />
                      {copied ? 'Скопировано' : 'Скопировать'}
                    </button>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {result.description}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => { setResult(null); setError(''); }}
              className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
            >
              <Icon name="RefreshCw" size={12} />
              Обновить анализ
            </button>
            <button onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition">
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, color, children }: {
  icon: string; title: string; color: string; children: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
    blue: 'text-blue-500',
    violet: 'text-violet-500',
    orange: 'text-orange-500',
    rose: 'text-rose-500',
  };
  return (
    <div className="bg-muted/40 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name={icon} size={13} className={colorMap[color] || 'text-muted-foreground'} />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function ListSection({ icon, title, color, items }: {
  icon: string; title: string; color: string; items: string[];
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
    blue: 'text-blue-500',
    violet: 'text-violet-500',
    orange: 'text-orange-500',
    rose: 'text-rose-500',
  };
  return (
    <div className="bg-muted/40 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon name={icon} size={13} className={colorMap[color] || 'text-muted-foreground'} />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center text-[9px] font-bold text-foreground flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
