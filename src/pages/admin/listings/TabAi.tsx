import { useEffect, useState, useRef } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing, splitImages } from './types';
import { AiMsg } from './internalCardTypes';
import { buildAutoPrompt } from './tabAiPrompt';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';
const ANALYZE_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';

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

export function TabAi({ listing }: { listing: Listing }) {
  // ── ВБ-чат ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [marketData, setMarketData] = useState<{ median?: number; min?: number; max?: number; analogs?: number } | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── ИИ-анализ ─────────────────────────────────────────────────────────────
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [analyzeTab, setAnalyzeTab] = useState<'analysis' | 'description'>('analysis');
  const [analyzeCopied, setAnalyzeCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<'vb' | 'analyze'>('vb');

  useEffect(() => {
    if (!listing.area || !listing.price || !listing.category || !listing.deal) return;
    fetch(PREDICT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mela_price_check',
        category: listing.category,
        deal: listing.deal,
        area: listing.area,
        price: listing.price,
        address: listing.address || '',
        district: listing.district || '',
        floor: listing.floor || null,
        condition: listing.condition || '',
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d?.verdict) {
          setMarketData({
            median: d.verdict.market_median_per_m2 ? d.verdict.market_median_per_m2 * listing.area : undefined,
            min: d.verdict.market_min_price,
            max: d.verdict.market_max_price,
            analogs: d.analogs_count,
          });
        }
      })
      .catch(() => {});
  }, [listing.id]);

  const ask = async (text: string) => {
    setLoading(true);
    if (text !== '__auto__') setMessages(m => [...m, { role: 'user', text }]);
    try {
      const prompt = text === '__auto__'
        ? buildAutoPrompt(listing, marketData)
        : text;
      const r = await aiApi.ask('marketing', prompt);
      setMessages(m => [...m, { role: 'ai', text: r.text }]);
      if (text === '__auto__') {
        await adminApi.addListingComment(listing.id, `[Виртуальный брокер] ${r.text}`, true).catch(() => {});
      }
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Ошибка при обращении к Виртуальному брокеру. Попробуйте ещё раз.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  useEffect(() => {
    if (!asked) { setAsked(true); ask('__auto__'); }
  }, []);

  const send = () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    ask(q);
  };

  const applyChange = async (field: 'title' | 'description', value: string) => {
    setApplying(field);
    try {
      await adminApi.updateListing(listing.id, { [field]: value });
      await adminApi.addListingHistory(listing.id, 'updated', { [field]: [(listing as Record<string, unknown>)[field], value] });
      setMessages(m => [...m, { role: 'ai', text: `Поле "${field === 'title' ? 'название' : 'описание'}" успешно обновлено.` }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Не удалось применить изменение.' }]);
    } finally {
      setApplying(null);
    }
  };

  // ── ИИ-анализ: запуск ─────────────────────────────────────────────────────
  const runAnalyze = async () => {
    setAnalyzeLoading(true);
    setAnalyzeError('');
    setAnalyzeResult(null);

    let mkt: Record<string, unknown> = {};
    try {
      const pr = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mela_price_check',
          category: listing.category,
          deal: listing.deal,
          area: listing.area,
          price: listing.price,
          address: listing.address || '',
          district: listing.district || '',
          floor: listing.floor || null,
          condition: listing.condition || '',
        }),
      });
      const pd = await pr.json();
      if (pd?.verdict) {
        mkt = {
          median_per_m2: pd.verdict.market_median_per_m2,
          min_price: pd.verdict.market_min_price,
          max_price: pd.verdict.market_max_price,
          analogs_count: pd.analogs_count,
          verdict_label: pd.verdict.label,
          delta_pct: pd.verdict.delta_pct,
        };
      }
    } catch { /* рыночные данные опциональны */ }

    try {
      const res = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze_property',
          listing: {
            title: listing.title,
            category: listing.category,
            deal: listing.deal,
            address: listing.address,
            district: listing.district,
            city: listing.city,
            area: listing.area,
            price: listing.price,
            floor: listing.floor,
            total_floors: listing.total_floors,
            condition: listing.condition,
            ceiling_height: listing.ceiling_height,
            electricity_kw: listing.electricity_kw,
            utilities: listing.utilities,
            parking: listing.parking,
            tenant_name: listing.tenant_name,
            monthly_rent: listing.monthly_rent,
            yearly_rent: listing.yearly_rent,
            profit: listing.profit,
            payback: listing.payback,
            purpose: listing.purpose,
            has_photos: !!(splitImages(listing.images).length || listing.image),
            photos_count: splitImages(listing.images).length || (listing.image ? 1 : 0),
          },
          market: mkt,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setAnalyzeResult(data as AnalyzeResult);
      setAnalyzeTab('analysis');
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Ошибка анализа');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const copyDescription = () => {
    if (!analyzeResult?.description) return;
    navigator.clipboard.writeText(analyzeResult.description).then(() => {
      setAnalyzeCopied(true);
      setTimeout(() => setAnalyzeCopied(false), 2000);
    });
  };

  const applyDescription = async () => {
    if (!analyzeResult?.description) return;
    setApplying('description');
    try {
      await adminApi.updateListing(listing.id, { description: analyzeResult.description });
      await adminApi.addListingHistory(listing.id, 'updated', { description: [listing.description, analyzeResult.description] });
    } catch { /* ignore */ } finally {
      setApplying(null);
    }
  };

  const lastAiText = [...messages].reverse().find(m => m.role === 'ai')?.text || '';

  return (
    <div className="flex flex-col">
      {/* Переключатель секций */}
      <div className="flex gap-1 p-3 border-b border-border bg-muted/30">
        <button
          onClick={() => setActiveSection('vb')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeSection === 'vb' ? 'bg-white border border-border shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Icon name="Sparkles" size={13} className="text-brand-orange" />
          Виртуальный брокер
        </button>
        <button
          onClick={() => setActiveSection('analyze')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeSection === 'analyze' ? 'bg-white border border-border shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Icon name="Brain" size={13} className="text-violet-500" />
          ИИ-анализ объекта
        </button>
      </div>

      {/* ── Виртуальный брокер ── */}
      {activeSection === 'vb' && (
        <div className="flex flex-col" style={{ minHeight: 460 }}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 380 }}>
            {messages.length === 0 && loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="Loader2" size={16} className="animate-spin text-brand-orange" />
                Виртуальный брокер анализирует объект...
              </div>
            )}
            {messages.map((m, i) => {
              if (m.role === 'user') return (
                <div key={i} className="flex justify-end">
                  <div className="bg-brand-blue text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[75%]">{m.text}</div>
                </div>
              );
              return (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="Sparkles" size={14} className="text-brand-orange" />
                  </div>
                  <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[80%] whitespace-pre-wrap leading-relaxed">{m.text}</div>
                </div>
              );
            })}
            {loading && messages.length > 0 && (
              <div className="flex gap-2 items-center text-xs text-muted-foreground">
                <Icon name="Loader2" size={14} className="animate-spin" /> Виртуальный брокер печатает...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {lastAiText && (
            <div className="px-5 py-2 border-t border-border bg-amber-50/50">
              <div className="text-xs text-muted-foreground mb-1.5 font-medium">Применить рекомендации Виртуального брокера:</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const match = lastAiText.match(/название[:\s«"]+([^»"\n]{5,100})/i);
                    if (match) applyChange('title', match[1].trim());
                    else ask('Предложи конкретное новое название для этого объекта одной строкой, без пояснений.');
                  }}
                  disabled={!!applying}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {applying === 'title' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Pencil" size={12} />}
                  Применить к названию
                </button>
                <button
                  onClick={() => {
                    const match = lastAiText.match(/описание[:\s«"]+([^»"]{20,})/i);
                    if (match) applyChange('description', match[1].trim());
                    else ask('Напиши новое описание для этого объекта (2-4 абзаца), без вводных слов.');
                  }}
                  disabled={!!applying}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {applying === 'description' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="FileText" size={12} />}
                  Применить к описанию
                </button>
                <button
                  onClick={() => ask('Предложи новое название и описание для этого объекта. Формат — сначала строка "Название: ..." затем "Описание: ..."')}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-orange hover:text-brand-orange transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Icon name="RefreshCw" size={12} /> Переписать всё
                </button>
              </div>
            </div>
          )}

          <div className="px-5 pb-5 pt-2 border-t border-border">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Задать вопрос Виртуальному брокеру..."
                disabled={loading}
                className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-brand-blue"
              />
              <button onClick={send} disabled={loading || !input.trim()}
                className="btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                <Icon name="Send" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ИИ-анализ объекта ── */}
      {activeSection === 'analyze' && (
        <div className="p-5 space-y-4">
          {!analyzeResult && !analyzeLoading && (
            <>
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-3">
                  <Icon name="Brain" size={24} className="text-violet-500" />
                </div>
                <div className="font-display font-700 text-base mb-1">Полный анализ объекта</div>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-sm mx-auto">
                  ИИ проведёт комплексный анализ: сравнение цен с рынком, ликвидность, инфраструктура района, рекомендации брокеру, УТП и готовое описание.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-5 text-left max-w-sm mx-auto">
                  {[
                    { icon: 'TrendingUp', label: 'Анализ цены и рынка' },
                    { icon: 'MapPin', label: 'Инфраструктура района' },
                    { icon: 'Zap', label: 'Ликвидность объекта' },
                    { icon: 'Star', label: 'Рекомендации и УТП' },
                    { icon: 'Wrench', label: 'Улучшения и доработки' },
                    { icon: 'FileText', label: 'Готовое описание' },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                      <Icon name={f.icon} size={13} className="text-violet-500 shrink-0" />
                      {f.label}
                    </div>
                  ))}
                </div>
              </div>
              {analyzeError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 mb-2">{analyzeError}</div>
              )}
              <button
                onClick={runAnalyze}
                className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
              >
                <Icon name="Sparkles" size={15} />
                Запустить анализ
              </button>
            </>
          )}

          {analyzeLoading && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin mx-auto mb-4" />
              <div className="font-display font-700 text-sm mb-1">Анализирую объект...</div>
              <div className="text-xs text-muted-foreground">Сравниваю цены, изучаю район, формирую рекомендации</div>
            </div>
          )}

          {analyzeResult && (
            <div className="space-y-4">
              {/* Вкладки */}
              <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
                {([
                  { key: 'analysis', label: 'Анализ', icon: 'BarChart2' },
                  { key: 'description', label: 'Описание', icon: 'FileText' },
                ] as const).map(t => (
                  <button key={t.key} onClick={() => setAnalyzeTab(t.key)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${analyzeTab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Icon name={t.icon} size={12} /> {t.label}
                  </button>
                ))}
              </div>

              {analyzeTab === 'analysis' && (
                <div className="space-y-3">
                  {[
                    { label: 'Анализ цены', value: analyzeResult.price_analysis, icon: 'TrendingUp' },
                    { label: 'Ликвидность', value: analyzeResult.liquidity, icon: 'Zap' },
                    { label: 'Инфраструктура района', value: analyzeResult.location_analysis, icon: 'MapPin' },
                    { label: 'Анализ объекта', value: analyzeResult.object_analysis, icon: 'Building2' },
                  ].map(s => s.value && (
                    <div key={s.label} className="bg-muted/30 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-muted-foreground">
                        <Icon name={s.icon} size={12} /> {s.label}
                      </div>
                      <div className="text-sm leading-relaxed">{s.value}</div>
                    </div>
                  ))}
                  {analyzeResult.broker_recommendations?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-amber-700">
                        <Icon name="Lightbulb" size={12} /> Рекомендации брокеру
                      </div>
                      <ul className="space-y-1">
                        {analyzeResult.broker_recommendations.map((r, i) => (
                          <li key={i} className="text-sm text-amber-800 flex gap-2"><span className="text-amber-400 shrink-0">•</span>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analyzeResult.improvements?.length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-emerald-700">
                        <Icon name="Wrench" size={12} /> Улучшения объекта
                      </div>
                      <ul className="space-y-1">
                        {analyzeResult.improvements.map((r, i) => (
                          <li key={i} className="text-sm text-emerald-800 flex gap-2"><span className="text-emerald-400 shrink-0">•</span>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analyzeResult.utp_titles?.length > 0 && (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-violet-700">
                        <Icon name="Star" size={12} /> Варианты УТП для названия
                      </div>
                      <ul className="space-y-1">
                        {analyzeResult.utp_titles.map((u, i) => (
                          <li key={i} className="text-sm text-violet-800 flex gap-2">
                            <span className="text-violet-400 shrink-0">{i + 1}.</span>
                            <span>{u}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {analyzeTab === 'description' && analyzeResult.description && (
                <div className="space-y-3">
                  <div className="bg-muted/30 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
                    {analyzeResult.description}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={copyDescription}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition">
                      <Icon name={analyzeCopied ? 'Check' : 'Copy'} size={13} className={analyzeCopied ? 'text-emerald-500' : ''} />
                      {analyzeCopied ? 'Скопировано' : 'Скопировать'}
                    </button>
                    <button onClick={applyDescription} disabled={!!applying}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition disabled:opacity-50">
                      {applying === 'description' ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Check" size={13} />}
                      Применить к объекту
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => { setAnalyzeResult(null); setAnalyzeError(''); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition">
                Запустить повторно
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}