import { useEffect, useState, useRef } from 'react';
import { adminApi, aiApi, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing, splitImages } from './types';
import { AiMsg } from './internalCardTypes';
import { buildAutoPrompt } from './tabAiPrompt';
import { AnalyzeResult } from './tabAiTypes';
import TabAiChat from './TabAiChat';
import TabAiAnalyzeIntro from './TabAiAnalyzeIntro';
import TabAiAnalyzeResult from './TabAiAnalyzeResult';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';
const ANALYZE_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';


export function TabAi({ listing }: { listing: Listing }) {
  // ── ВБ-чат ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [marketData, setMarketData] = useState<{ median?: number; min?: number; max?: number; analogs?: number } | undefined>();
  const [marketLoading, setMarketLoading] = useState(false);
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
    setMarketLoading(true);
    fetch(PREDICT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
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
      .catch(() => {})
      .finally(() => setMarketLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
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
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
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
        <TabAiChat
          messages={messages}
          loading={loading}
          marketLoading={marketLoading}
          bottomRef={bottomRef}
          lastAiText={lastAiText}
          applying={applying}
          applyChange={applyChange}
          ask={ask}
          input={input}
          setInput={setInput}
          send={send}
        />
      )}

      {/* ── ИИ-анализ объекта ── */}
      {activeSection === 'analyze' && (
        <div className="p-5 space-y-4">
          <TabAiAnalyzeIntro
            analyzeResult={analyzeResult}
            analyzeLoading={analyzeLoading}
            analyzeError={analyzeError}
            runAnalyze={runAnalyze}
          />

          {analyzeResult && (
            <TabAiAnalyzeResult
              analyzeResult={analyzeResult}
              analyzeTab={analyzeTab}
              setAnalyzeTab={setAnalyzeTab}
              analyzeCopied={analyzeCopied}
              applying={applying}
              copyDescription={copyDescription}
              applyDescription={applyDescription}
              setAnalyzeResult={setAnalyzeResult}
              setAnalyzeError={setAnalyzeError}
            />
          )}
        </div>
      )}
    </div>
  );
}
