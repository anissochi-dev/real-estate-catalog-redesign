import { useEffect, useState, useRef } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { AiMsg } from './internalCardTypes';
import { buildAutoPrompt } from './tabAiPrompt';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

export function TabAi({ listing }: { listing: Listing }) {
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [marketData, setMarketData] = useState<{ median?: number; min?: number; max?: number; analogs?: number } | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const lastAiText = [...messages].reverse().find(m => m.role === 'ai')?.text || '';

  return (
    <div className="flex flex-col" style={{ minHeight: 500 }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 420 }}>
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
  );
}
