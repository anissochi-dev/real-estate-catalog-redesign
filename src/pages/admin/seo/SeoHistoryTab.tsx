import Icon from '@/components/ui/icon';
import { RunLog, TRIGGER_LABELS, fmtDate, fmtDuration } from './seoTypes';

interface Props {
  logs: RunLog[];
  historyLoading: boolean;
  loadHistory: () => void;
}

export default function SeoHistoryTab({ logs, historyLoading, loadHistory }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Показаны последние {logs.length} запусков (макс. 50)
        </div>
        <button onClick={loadHistory} disabled={historyLoading}
          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50">
          <Icon name={historyLoading ? 'Loader2' : 'RefreshCw'} size={12} className={historyLoading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>
      {historyLoading && logs.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          <Icon name="Loader2" size={24} className="mx-auto mb-2 animate-spin opacity-60" />
          Загружаю историю...
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          <Icon name="History" size={32} className="mx-auto mb-2 opacity-40" />
          История запусков пуста
        </div>
      ) : (
        logs.map(log => {
          const trig = TRIGGER_LABELS[log.triggered_by] || { label: log.triggered_by, color: 'text-muted-foreground bg-muted' };
          const dur = fmtDuration(log.started_at, log.finished_at);
          return (
            <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white hover:bg-muted/30 transition">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.errors > 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                <Icon name={log.errors > 0 ? 'AlertTriangle' : 'CheckCircle2'} size={16}
                  className={log.errors > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${trig.color}`}>
                    {trig.label}
                  </span>
                  {log.dry_run && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      превью
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{fmtDate(log.started_at)}</span>
                  {dur && <span className="text-xs text-muted-foreground">· {dur}</span>}
                </div>
                <div className="text-xs mt-0.5 text-foreground">
                  {log.processed} обработано из {log.total}
                  {log.errors > 0 && <span className="text-red-600 ml-1">· {log.errors} ошибок</span>}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
