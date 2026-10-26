import Icon from '@/components/ui/icon';
import { HistoryItem, ACTION_LABELS, FIELD_LABELS, groupHistory, extractOldNew, fmtVal, fmtDt } from './listingHistoryUtils';

interface Props {
  history: HistoryItem[];
}

export default function ListingHistoryChangesTab({ history }: Props) {
  return (
    <div className="space-y-2">
      {groupHistory(history).length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-8">История пуста</div>
      ) : (
        groupHistory(history).map(h => {
          const meta = ACTION_LABELS[h.action] || { label: h.action, icon: 'Activity', color: 'text-slate-600 bg-slate-50' };
          return (
            <div key={h.id} className="flex gap-3 p-3 rounded-xl hover:bg-muted/30">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.color}`}>
                <Icon name={meta.icon} size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-xs text-muted-foreground">{h.user_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmtDt(h.created_at)}</span>
                </div>
                {h.changes && Object.keys(h.changes).length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {Object.entries(h.changes).slice(0, 10).map(([field, raw]) => {
                      const { old: oldV, new: newV } = extractOldNew(raw);
                      const oldStr = fmtVal(field, oldV);
                      const newStr = fmtVal(field, newV);
                      const isDescr = field === 'description';
                      const isImages = field === 'images';
                      return (
                        <div key={field} className="text-xs flex items-start gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground">{FIELD_LABELS[field] || field}:</span>{' '}
                          {isDescr || isImages ? (
                            <span className="text-muted-foreground italic">
                              {isImages
                                ? `обновлены (было ${String(oldV ?? '').split(/[|,]/).filter(Boolean).length} → стало ${String(newV ?? '').split(/[|,]/).filter(Boolean).length} фото)`
                                : `описание изменено (было ${String(oldV ?? '').length} симв. → стало ${String(newV ?? '').length} симв.)`}
                            </span>
                          ) : (
                            <>
                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 line-through opacity-80 break-all">{oldStr}</span>
                              <Icon name="ArrowRight" size={11} className="text-muted-foreground mt-0.5" />
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium break-all">{newStr}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                    {Object.keys(h.changes).length > 10 && (
                      <div className="text-[11px] text-muted-foreground italic">
                        и ещё {Object.keys(h.changes).length - 10} изменений…
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
