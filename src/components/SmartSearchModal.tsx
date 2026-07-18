import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';

const AI_ASSISTANT_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';

interface SearchResult {
  id: number;
  title: string;
  category: string;
  deal: string;
  price: number;
  price_per_m2?: number;
  area: number;
  address: string;
  district?: string;
  image?: string;
  image_thumb?: string;
  slug?: string;
  price_unit?: string;
  monthly_rent?: number;
  payback?: number;
}

const DEAL_LABEL: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };
const CAT_LABEL: Record<string, string> = {
  office: 'Офис', retail: 'Магазин', warehouse: 'Склад',
  restaurant: 'Общепит', hotel: 'Гостиница', building: 'Здание',
  land: 'Земля', free_purpose: 'Своб. назначение', production: 'Производство',
  car_service: 'Автосервис', gab: 'ГАБ', business: 'Готовый бизнес',
};

function fmtPrice(price: number, unit?: string) {
  if (!price) return '—';
  const m = price >= 1_000_000;
  const val = m ? (price / 1_000_000).toFixed(1).replace('.0', '') : (price / 1000).toFixed(0);
  const sfx = m ? ' млн ₽' : ' тыс ₽';
  const per = unit === 'm2' ? '/м²' : unit === 'sotka' ? '/сот.' : '';
  return val + sfx + per;
}

const HINTS = [
  'снять офис до 100м² в центре',
  'склад от 500м² с пандусом и электричеством 380В',
  'помещение под кафе на первой линии в ЧМР',
  'купить торговое помещение до 10 млн рублей',
  'готовый арендный бизнес с доходом от 200 тыс/мес',
  'здание в ЮМР до 150 000 ₽/м²',
  'производство с газом от 1000м²',
  'id 200',
];

interface Props {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
}

export default function SmartSearchModal({ open, initialQuery = '', onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [advice, setAdvice] = useState('');
  const [error, setError] = useState('');
  const [hint] = useState(() => HINTS[Math.floor(Math.random() * HINTS.length)]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setResults(null);
      setReasoning('');
      setAdvice('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialQuery]);

  const search = async (q: string) => {
    const text = q.trim();
    if (!text || text.length < 3) return;
    setLoading(true);
    setError('');
    setResults(null);
    setReasoning('');
    setAdvice('');
    try {
      const res = await fetch(AI_ASSISTANT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match', message: text }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Ошибка поиска');
      setResults(data.listings || []);
      setReasoning(data.reasoning || '');
      setAdvice(data.advice || '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const goToListing = (item: SearchResult) => {
    onClose();
    if (item.slug) navigate(`/object/${item.slug}`);
    else navigate(`/catalog`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

        {/* Search input */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Icon name="Sparkles" size={18} className="text-white" />
            </div>
            <form
              className="flex-1 flex items-center gap-2"
              onSubmit={e => { e.preventDefault(); search(query); }}
            >
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Например: ${hint}`}
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
              />
              <button
                type="submit"
                disabled={loading || query.trim().length < 3}
                className="shrink-0 px-4 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {loading
                  ? <Icon name="Loader2" size={14} className="animate-spin" />
                  : <Icon name="Search" size={14} />
                }
                Найти
              </button>
            </form>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <Icon name="X" size={20} />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 ml-12">
            Умный поиск понимает обычный язык — площадь, район, тип, цену и назначение
          </p>
        </div>

        {/* Подсказки — быстрые примеры */}
        {!results && !loading && (
          <div className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Примеры запросов:</p>
            <div className="flex flex-wrap gap-2">
              {HINTS.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setQuery(h); search(h); }}
                  className="text-xs bg-muted hover:bg-muted/70 px-3 py-1.5 rounded-full text-foreground transition-colors border border-border"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Загрузка */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
              <Icon name="Loader2" size={24} className="animate-spin text-violet-600" />
            </div>
            <span className="text-sm">Анализирую запрос и ищу подходящие объекты…</span>
          </div>
        )}

        {/* Ошибка */}
        {error && !loading && (
          <div className="p-4 text-sm text-red-600 flex items-center gap-2">
            <Icon name="AlertCircle" size={16} />
            {error}
          </div>
        )}

        {/* Результаты */}
        {results && !loading && (
          <div className="overflow-y-auto flex-1">
            {results.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Icon name="SearchX" size={36} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold">Подходящих объектов не найдено</p>
                {reasoning && <p className="text-xs mt-2 text-foreground/70">{reasoning}</p>}
                {advice && (
                  <div className="mt-3 bg-violet-50 rounded-xl px-4 py-2.5 text-left">
                    <p className="text-[11px] font-semibold text-violet-700 mb-0.5">Совет:</p>
                    <p className="text-xs text-violet-800">{advice}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Комментарий ИИ */}
                {reasoning && (
                  <div className="px-4 pt-3 pb-2 border-b border-border bg-muted/30">
                    <div className="flex items-start gap-2">
                      <Icon name="Sparkles" size={13} className="text-violet-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground/80">{reasoning}</p>
                    </div>
                    {advice && (
                      <div className="flex items-start gap-2 mt-1.5">
                        <Icon name="Lightbulb" size={13} className="text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">{advice}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Найдено {results.length} {results.length === 1 ? 'объект' : results.length < 5 ? 'объекта' : 'объектов'}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {results.map(item => (
                    <button
                      key={item.id}
                      onClick={() => goToListing(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                    >
                      <div className="w-16 h-14 rounded-lg overflow-hidden shrink-0 bg-muted border border-border">
                        {item.image
                          ? <img src={item.image_thumb || item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <Icon name="Building2" size={20} />
                            </div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                            {CAT_LABEL[item.category] || item.category}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {DEAL_LABEL[item.deal] || item.deal}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">#{item.id}</span>
                        </div>
                        <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {item.area ? <span>{item.area} м²</span> : null}
                          {item.district ? <span>· {item.district}</span> : null}
                          {item.monthly_rent
                            ? <span className="text-emerald-600 font-semibold ml-auto">{fmtPrice(item.monthly_rent)}/мес</span>
                            : item.price
                              ? <span className="text-brand-blue font-semibold ml-auto">{fmtPrice(item.price)}</span>
                              : null}
                        </div>
                        {item.price_per_m2 ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.price_per_m2.toLocaleString('ru')} ₽/м²</p>
                        ) : null}
                      </div>
                      <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}