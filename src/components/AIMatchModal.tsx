import { useEffect, useState } from 'react';
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
  office: 'Офис',
  retail: 'Торговое помещение',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производственное помещение',
  hotel: 'Гостиница',
  gab: 'ГАБ',
  land: 'Земельный участок',
  building: 'Отдельно стоящее здание',
  free_purpose: 'Свободное назначение',
  car_service: 'Автосервис',
};

const DEAL_LABEL: Record<string, string> = {
  sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес',
};

const EXAMPLES = [
  'Офис 100 м² в центре до 15 млн ₽',
  'Торговое помещение под кофейню с трафиком',
  'Готовый бизнес с окупаемостью до 36 месяцев',
  'Склад от 500 м² с удобным заездом',
];

function fmtPrice(price: number, deal: string): string {
  if (deal === 'rent') return `${price.toLocaleString('ru')} ₽/мес`;
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(price >= 10_000_000 ? 0 : 1)} млн ₽`;
  return `${price.toLocaleString('ru')} ₽`;
}

export default function AIMatchModal({ open, onClose, initialPrompt, autoSubmit }: Props) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (text?: string) => {
    const q = (text ?? prompt).trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await aiMatch(q);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialPrompt !== undefined) setPrompt(initialPrompt);
    if (autoSubmit && initialPrompt && initialPrompt.trim()) {
      submit(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, autoSubmit]);

  if (!open) return null;

  const reset = () => {
    setPrompt('');
    setResult(null);
    setError(null);
  };

  const close = () => {
    if (loading) return;
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
         onClick={close}>
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-blue to-blue-700 flex items-center justify-center">
              <Icon name="Sparkles" size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display font-800 text-base">ИИ-подбор объекта</div>
              <div className="text-[11px] text-muted-foreground">Опишите задачу — найдём за 2 минуты</div>
            </div>
          </div>
          <button onClick={close} disabled={loading}
                  className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-30">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!result && (
            <>
              <label className="text-sm font-semibold block mb-2">Что вы ищете?</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Например: офис 80–120 м² в центре Краснодара до 18 млн ₽, готовый к работе..."
                rows={4}
                disabled={loading}
                className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-brand-blue resize-none"
              />

              <div className="text-xs text-muted-foreground mt-3 mb-2">Подсказки:</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map(ex => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-full bg-muted text-foreground text-xs hover:bg-brand-blue hover:text-white transition-colors disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
                  <Icon name="AlertCircle" size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-4">
              {result.reasoning && (
                <div className="p-3 rounded-xl bg-brand-blue/5 border border-brand-blue/20">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-brand-blue mb-1 flex items-center gap-1">
                    <Icon name="Brain" size={12} /> Почему эти варианты
                  </div>
                  <div className="text-sm text-foreground">{result.reasoning}</div>
                </div>
              )}

              {result.listings.length === 0 ? (
                <div className="text-center py-8">
                  <Icon name="SearchX" size={36} className="text-muted-foreground/40 mx-auto mb-2" />
                  <div className="font-semibold text-sm mb-1">Ничего не нашлось</div>
                  <div className="text-xs text-muted-foreground">Попробуйте описать задачу иначе или смягчить критерии</div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Подходящих объектов: {result.listings.length}
                  </div>
                  {result.listings.map(it => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        navigate(`/object/${listingSlug(it.title, it.id)}`);
                        close();
                      }}
                      className="w-full flex gap-3 p-2.5 rounded-xl border border-border hover:border-brand-blue hover:shadow-md transition-all text-left bg-white"
                    >
                      <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {it.image ? (
                          <img src={it.image} alt={it.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="Image" size={20} className="text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue">
                            {TYPE_LABEL[it.category] || it.category}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {DEAL_LABEL[it.deal] || it.deal}
                          </span>
                        </div>
                        <div className="font-semibold text-sm mb-0.5 truncate">{it.title}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                          <Icon name="MapPin" size={10} className="flex-shrink-0" />
                          {it.district || it.address}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="font-display font-800 text-sm text-brand-blue">
                            {fmtPrice(it.price, it.deal)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">· {it.area} м²</div>
                          {it.payback && (
                            <div className="text-[11px] text-emerald-600 font-semibold">
                              · окуп. {it.payback} мес
                            </div>
                          )}
                        </div>
                      </div>
                      <Icon name="ChevronRight" size={16} className="text-muted-foreground self-center flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {result.advice && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 mb-1 flex items-center gap-1">
                    <Icon name="Lightbulb" size={12} /> Совет
                  </div>
                  <div className="text-sm text-foreground">{result.advice}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0 flex gap-2">
          {result ? (
            <>
              <button onClick={reset}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
                Новый запрос
              </button>
              <button onClick={() => { navigate('/catalog'); close(); }}
                      className="flex-1 btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold">
                Весь каталог
              </button>
            </>
          ) : (
            <>
              <button onClick={close} disabled={loading}
                      className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">
                Отмена
              </button>
              <button onClick={() => submit()} disabled={!prompt.trim() || loading}
                      className="flex-1 btn-orange text-white px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Подбираем...
                  </>
                ) : (
                  <>
                    <Icon name="Sparkles" size={14} />
                    Подобрать
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}