import Icon from '@/components/ui/icon';
import { AuditData } from './seoAuditTypes';

interface Props {
  data: AuditData;
  missingFaq: number;
  fixedFaqIds: Set<number>;
  faqUpdatedAt: Record<number, string>;
  faqSearch: string;
  faqFilter: 'all' | 'has' | 'missing';
  fixingFaqId: number | null;
  regeneratingAll: boolean;
  regenProgress: { done: number; total: number };
  filteredFaqListings: AuditData['all_listings'];
  onSetFaqSearch: (v: string) => void;
  onSetFaqFilter: (v: 'all' | 'has' | 'missing') => void;
  onFixOneFaq: (id: number, hasFaq: boolean) => void;
  onRegenerateAllFaq: () => void;
}

export default function SeoFaqManager({
  data, missingFaq, fixedFaqIds, faqUpdatedAt,
  faqSearch, faqFilter, fixingFaqId, regeneratingAll, regenProgress,
  filteredFaqListings,
  onSetFaqSearch, onSetFaqFilter, onFixOneFaq, onRegenerateAllFaq,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-700 text-base flex items-center gap-2">
            <Icon name="HelpCircle" size={16} className="text-blue-500" />
            Управление FAQ объектов
          </h3>
          <div className="text-xs text-muted-foreground mt-0.5">
            Заполнено: {data.stats.has_faq || 0} из {data.total} объектов
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {missingFaq > 0 && (
            <button
              onClick={onRegenerateAllFaq}
              disabled={regeneratingAll}
              className="text-xs bg-brand-blue hover:bg-brand-blue/90 text-white px-3 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Icon name={regeneratingAll ? 'Loader2' : 'Sparkles'} size={13} className={regeneratingAll ? 'animate-spin' : ''} />
              {regeneratingAll
                ? `Генерирую… ${regenProgress.done}/${regenProgress.total}`
                : `Сгенерировать недостающие (${missingFaq})`}
            </button>
          )}
          {missingFaq === 0 && !regeneratingAll && (
            <span className="text-xs text-emerald-600 flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-xl">
              <Icon name="CheckCircle2" size={12} /> Все объекты заполнены
            </span>
          )}
        </div>
      </div>

      {/* Поиск и фильтр */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={faqSearch}
            onChange={e => onSetFaqSearch(e.target.value)}
            placeholder="Поиск по названию или ID..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:border-brand-blue"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {([['all', 'Все'], ['missing', 'Нет FAQ'], ['has', 'Есть FAQ']] as const).map(([v, l]) => (
            <button key={v} onClick={() => onSetFaqFilter(v)}
              className={`px-3 py-2 transition-colors ${faqFilter === v ? 'bg-brand-blue text-white' : 'hover:bg-muted text-muted-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Список объектов */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {filteredFaqListings.map(l => {
          const hasFaq = l.has_faq || fixedFaqIds.has(l.id);
          const isGenerating = fixingFaqId === l.id;
          const updatedNow = faqUpdatedAt[l.id];
          const updatedFrom = updatedNow ?? l.faq_updated_at;
          const updatedLabel = updatedFrom
            ? new Date(updatedFrom).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : null;
          return (
            <div key={l.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${updatedNow ? 'border-blue-200 bg-blue-50/40' : 'border-border hover:bg-muted/30'}`}>
              <span className="text-[11px] font-mono text-muted-foreground w-10 shrink-0">#{l.id}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{l.title}</div>
                {updatedLabel && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Icon name="Clock" size={9} />
                    {updatedNow ? 'Обновлено' : 'Последнее обновление'}: {updatedLabel}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasFaq
                  ? <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Icon name="Check" size={9} /> Есть
                    </span>
                  : <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Нет</span>
                }
                <button
                  onClick={() => onFixOneFaq(l.id, hasFaq)}
                  disabled={isGenerating || regeneratingAll}
                  className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors ${hasFaq ? 'bg-muted hover:bg-blue-50 hover:text-blue-600 border border-border' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                >
                  <Icon name={isGenerating ? 'Loader2' : hasFaq ? 'RefreshCw' : 'Sparkles'} size={11} className={isGenerating ? 'animate-spin' : ''} />
                  {isGenerating ? '...' : hasFaq ? 'Обновить' : 'Создать'}
                </button>
              </div>
            </div>
          );
        })}
        {filteredFaqListings.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">Объекты не найдены</div>
        )}
      </div>
    </div>
  );
}
