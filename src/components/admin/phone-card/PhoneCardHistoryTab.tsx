import Icon from '@/components/ui/icon';
import { HistoryEntry, EVENT_LABELS, FIELD_LABELS, fmtDt } from './types';

interface Props {
  history: HistoryEntry[];
}

export default function PhoneCardHistoryTab({ history }: Props) {
  return (
    <div className="p-5">
      {history.length === 0 ? (
        <div className="text-sm text-muted-foreground">История изменений пуста</div>
      ) : (
        <div className="space-y-2">
          {history.map(h => EVENT_LABELS[h.field_name] ? (
            <div key={h.id} className="p-3 rounded-xl border border-border bg-white">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${EVENT_LABELS[h.field_name].cls}`}>
                  <Icon name={EVENT_LABELS[h.field_name].icon} size={12} />
                  {EVENT_LABELS[h.field_name].label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtDt(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                </span>
              </div>
              {h.new_value && <div className="text-xs mt-1.5 break-words">{h.new_value}</div>}
            </div>
          ) : (
            <div key={h.id} className="p-3 rounded-xl border border-border bg-white">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-brand-blue">
                  {FIELD_LABELS[h.field_name] || h.field_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtDt(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">Было</div>
                  <div className={`px-2 py-1 rounded bg-red-50 text-red-800 line-through opacity-80 break-words ${
                    h.field_name === 'photo_url' ? 'italic' : ''
                  }`}>
                    {h.field_name === 'photo_url'
                      ? (h.old_value ? 'фото' : '—')
                      : (h.old_value || '—')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">Стало</div>
                  <div className={`px-2 py-1 rounded bg-emerald-50 text-emerald-800 break-words ${
                    h.field_name === 'photo_url' ? 'italic' : ''
                  }`}>
                    {h.field_name === 'photo_url'
                      ? (h.new_value ? 'фото' : '—')
                      : (h.new_value || '—')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
