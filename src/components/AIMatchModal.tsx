import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { aiMatch, AiMatchResult } from '@/lib/api';
import { listingSlug } from '@/lib/slug';

interface Props {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  autoSubmit?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад',
  restaurant: 'Общепит', business: 'Готовый бизнес', production: 'Производство',
  hotel: 'Гостиница', gab: 'ГАБ', land: 'Земля',
  building: 'Здание', free_purpose: 'Своб. назначение', car_service: 'Автосервис',
};
const DEAL_LABEL: Record<string, string> = { sale: 'Продажа', rent: 'Аренда', business: 'Бизнес' };

// ── Быстрые фильтры ────────────────────────────────────────────────────────
const QUICK_FILTERS = {
  deal: [
    { label: 'Купить', value: 'продажа' },
    { label: 'Арендовать', value: 'аренда' },
    { label: 'Готовый бизнес', value: 'готовый бизнес' },
  ],
  category: [
    { label: '🏢 Офис', value: 'офис' },
    { label: '🛍 Торговое', value: 'торговое помещение' },
    { label: '🏭 Склад', value: 'склад' },
    { label: '☕ Общепит', value: 'кафе ресторан' },
    { label: '🏗 Производство', value: 'производство' },
    { label: '🏠 Здание', value: 'здание' },
    { label: '🌿 Земля', value: 'земельный участок' },
    { label: '📦 Своб. назначение', value: 'свободного назначения' },
    { label: '🚗 Автосервис', value: 'автосервис' },
    { label: '🏨 Гостиница', value: 'гостиница' },
    { label: '💼 ГАБ', value: 'готовый арендный бизнес' },
  ],
  area: [
    { label: 'до 50 м²', value: 'до 50 м²' },
    { label: '50–150 м²', value: 'от 50 до 150 м²' },
    { label: '150–500 м²', value: 'от 150 до 500 м²' },
    { label: '500–1000 м²', value: 'от 500 до 1000 м²' },
    { label: 'от 1000 м²', value: 'от 1000 м²' },
  ],
  budget: [
    { label: 'до 5 млн', value: 'бюджет до 5 млн рублей' },
    { label: 'до 15 млн', value: 'бюджет до 15 млн рублей' },
    { label: 'до 30 млн', value: 'бюджет до 30 млн рублей' },
    { label: 'до 50 млн', value: 'бюджет до 50 млн рублей' },
    { label: 'от 50 млн', value: 'бюджет от 50 млн рублей' },
  ],
  features: [
    { label: '🅿 Парковка', value: 'с парковкой' },
    { label: '1-я линия', value: 'первая линия домов' },
    { label: '⚡ Высокая мощность', value: 'высокая электромощность от 100 кВт' },
    { label: '🏔 Высокие потолки', value: 'высокие потолки от 4 метров' },
    { label: '🚪 Вход с улицы', value: 'отдельный вход с улицы' },
    { label: '📈 Доходность', value: 'с арендатором и подтверждённым доходом' },
    { label: '⏱ Окупаемость до 7 лет', value: 'окупаемость до 84 месяцев' },
    { label: '🔧 Под ремонт', value: 'без отделки или под ремонт' },
    { label: '✨ Готово к работе', value: 'готово к работе, хороший ремонт' },
  ],
};

const EXAMPLES = [
  'Офис 100 м² в центре до 15 млн ₽',
  'Торговое помещение под кофейню с трафиком',
  'Готовый бизнес с окупаемостью до 36 месяцев',
  'Склад от 500 м² с удобным заездом',
  'ГАБ с доходностью от 500 тыс/мес',
  'Производство с мощностью от 150 кВт',
];

function fmtPrice(price: number, deal: string): string {
  if (deal === 'rent') return `${price.toLocaleString('ru')} ₽/мес`;
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(price >= 10_000_000 ? 0 : 1)} млн ₽`;
  return `${price.toLocaleString('ru')} ₽`;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  result?: AiMatchResult;
}

export default function AIMatchModal({ open, onClose, initialPrompt, autoSubmit }: Props) {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTab, setFilterTab] = useState<keyof typeof QUICK_FILTERS>('deal');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasResult = messages.some(m => m.result);
  const lastResult = [...messages].reverse().find(m => m.result)?.result;

  const scrollBottom = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  const buildPrompt = (text: string): string => {
    const filters = activeFilters.length > 0 ? ` (${activeFilters.join(', ')})` : '';
    return text + filters;
  };

  const buildHistory = () =>
    messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));

  const submit = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const fullPrompt = buildPrompt(q);
    setMessages(prev => [...prev, { role: 'user', text: q + (activeFilters.length ? ` [${activeFilters.join(', ')}]` : '') }]);
    setInput('');
    setError(null);
    setLoading(true);
    scrollBottom();
    try {
      const r = await aiMatch(fullPrompt, buildHistory());
      setMessages(prev => [...prev, { role: 'ai', text: r.reasoning, result: r }]);
      scrollBottom();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialPrompt !== undefined) setInput(initialPrompt);
    if (autoSubmit && initialPrompt?.trim()) submit(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, autoSubmit]);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput('');
      setError(null);
      setActiveFilters([]);
      setShowFilters(false);
    }
  }, [open]);

  const toggleFilter = (value: string) => {
    setActiveFilters(prev =>
      prev.includes(value) ? prev.filter(f => f !== value) : [...prev, value]
    );
  };

  const close = () => { if (!loading) onClose(); };

  if (!open) return null;

  const FILTER_TABS: { key: keyof typeof QUICK_FILTERS; label: string }[] = [
    { key: 'deal', label: 'Сделка' },
    { key: 'category', label: 'Тип' },
    { key: 'area', label: 'Площадь' },
    { key: 'budget', label: 'Бюджет' },
    { key: 'features', label: 'Параметры' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm"
      onClick={close}>
      <div
        className="bg-background w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-blue to-indigo-700 flex items-center justify-center shrink-0">
              <Icon name="Sparkles" size={17} className="text-white" />
            </div>
            <div>
              <div className="font-display font-800 text-sm leading-tight">ИИ-подбор объекта</div>
              <div className="text-[10px] text-muted-foreground">Опишите задачу — найдём подходящие варианты</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {hasResult && (
              <button
                onClick={() => { setMessages([]); setActiveFilters([]); setError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition flex items-center gap-1"
              >
                <Icon name="RefreshCw" size={12} /> Новый поиск
              </button>
            )}
            <button onClick={close} disabled={loading}
              className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-30">
              <Icon name="X" size={16} />
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {messages.length === 0 ? (
            /* Начальный экран */
            <div className="px-4 py-4 space-y-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Быстрые подсказки</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => { setInput(ex); textareaRef.current?.focus(); }}
                    className="px-2.5 py-1 rounded-full bg-muted text-foreground text-xs hover:bg-brand-blue hover:text-white transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Диалог */
            <div className="px-4 py-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-brand-blue text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[80%]">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Reasoning */}
                      {msg.text && (
                        <div className="flex gap-2 items-start">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon name="Sparkles" size={13} className="text-indigo-600" />
                          </div>
                          <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground leading-relaxed flex-1">
                            {msg.text}
                          </div>
                        </div>
                      )}

                      {/* Результаты */}
                      {msg.result && msg.result.listings.length === 0 ? (
                        <div className="ml-9 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                          <div className="font-semibold mb-0.5">Ничего не нашлось</div>
                          {msg.result.advice && <div className="text-xs">{msg.result.advice}</div>}
                          <div className="text-xs mt-1 text-amber-600">Уточните запрос или измените критерии</div>
                        </div>
                      ) : msg.result ? (
                        <div className="ml-9 space-y-2">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Найдено: {msg.result.listings.length}
                          </div>
                          {msg.result.listings.map(it => (
                            <button
                              key={it.id}
                              onClick={() => { navigate(`/object/${listingSlug(it.title, it.id)}`); close(); }}
                              className="w-full flex gap-3 p-2.5 rounded-xl border border-border hover:border-brand-blue hover:shadow-md transition-all text-left bg-white dark:bg-muted/20"
                            >
                              <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
                                {it.image
                                  ? <img src={it.image_thumb || it.image} alt={it.title} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center"><Icon name="Building2" size={18} className="text-muted-foreground/40" /></div>
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue shrink-0">
                                    {TYPE_LABEL[it.category] || it.category}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">{DEAL_LABEL[it.deal] || it.deal}</span>
                                </div>
                                <div className="font-semibold text-sm leading-tight mb-0.5 line-clamp-1">{it.title}</div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                                  <Icon name="MapPin" size={10} className="shrink-0" />
                                  {[it.district, it.address].filter(Boolean).join(' · ') || 'Краснодар'}
                                  {it.area ? <span className="ml-1">· {it.area} м²</span> : null}
                                </div>
                                {it.price ? (
                                  <div className="font-display font-700 text-sm text-brand-blue mt-0.5">
                                    {fmtPrice(it.price, it.deal)}
                                  </div>
                                ) : null}
                              </div>
                              <Icon name="ChevronRight" size={14} className="text-muted-foreground/50 shrink-0 self-center" />
                            </button>
                          ))}
                          {msg.result.advice && (
                            <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 leading-relaxed">
                              💡 {msg.result.advice}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-2 items-center text-xs text-muted-foreground">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                    <Icon name="Loader2" size={13} className="animate-spin text-indigo-500" />
                  </div>
                  Подбираю варианты...
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <Icon name="AlertCircle" size={14} />
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Фильтры */}
        {showFilters && (
          <div className="border-t border-border px-4 py-3 bg-muted/20 flex-shrink-0">
            {/* Табы фильтров */}
            <div className="flex gap-1 mb-2.5 overflow-x-auto pb-0.5">
              {FILTER_TABS.map(t => (
                <button key={t.key} onClick={() => setFilterTab(t.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${filterTab === t.key ? 'bg-brand-blue text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {/* Чипы фильтров */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_FILTERS[filterTab].map(f => (
                <button key={f.value} onClick={() => toggleFilter(f.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${activeFilters.includes(f.value) ? 'bg-brand-blue text-white' : 'bg-white dark:bg-muted border border-border hover:border-brand-blue text-foreground'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            {activeFilters.length > 0 && (
              <button onClick={() => setActiveFilters([])} className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline">
                Сбросить фильтры ({activeFilters.length})
              </button>
            )}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 border-t border-border flex-shrink-0">
          {/* Активные фильтры-теги */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {activeFilters.map(f => (
                <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue text-[11px] font-medium">
                  {f}
                  <button onClick={() => toggleFilter(f)} className="hover:text-red-500 transition-colors">
                    <Icon name="X" size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors relative ${showFilters ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
              title="Фильтры"
            >
              <Icon name="SlidersHorizontal" size={16} />
              {activeFilters.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-orange text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activeFilters.length}
                </span>
              )}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={hasResult ? 'Уточните запрос: «покажи дешевле», «только с парковкой»...' : 'Опишите что ищете...'}
              rows={2}
              disabled={loading}
              className="flex-1 px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-brand-blue resize-none disabled:opacity-50"
            />
            <button
              onClick={() => submit()}
              disabled={loading || !input.trim()}
              className="shrink-0 w-9 h-9 rounded-xl bg-brand-blue hover:bg-brand-blue/90 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
            >
              <Icon name={loading ? 'Loader2' : 'Send'} size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Enter — отправить · Shift+Enter — перенос строки
          </div>
        </div>
      </div>
    </div>
  );
}