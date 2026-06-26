import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { getToken } from '@/lib/adminApi';

const S3_AUDIT_URL = 'https://functions.poehali.dev/771d2935-3c3b-42d7-b305-9cd609c5d832';
const PHOTO_CLEANUP_URL = 'https://functions.poehali.dev/98a2eda7-410c-4378-91b9-a2f195cc0dc2';

interface PhotoRefsStats {
  total_tracked: number;
  attached: number;
  orphan_total: number;
  orphan_ready: number;
  orphan_fresh: number;
}
interface AuditResult {
  photo_refs: PhotoRefsStats;
  fresh_orphans_sample: { s3_key: string; cdn_url: string; uploaded_at: string }[];
  cleanup_history: { run_at: string; orphan_s3: number; removed_s3: number; status: string }[];
}

export default function S3OrphanAudit() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ removed: number; failed: number } | null>(null);

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${S3_AUDIT_URL}/?token=${encodeURIComponent(token)}`);
      const d = await res.json();
      if (!d.error) setAudit(d);
    } catch { /* ignore */ }
    finally { setAuditLoading(false); }
  };

  const runCleanup = async (mode: 'dry_run' | 'run') => {
    if (mode === 'run' && !confirm('Удалить все сиротские фото старше 24 часов из S3? Действие необратимо.')) return;
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const token = getToken();
      const res = await fetch(`${PHOTO_CLEANUP_URL}/?action=${mode}&token=${encodeURIComponent(token)}`);
      const d = await res.json();
      if (mode === 'run' && !d.error) setCleanupResult({ removed: d.removed ?? 0, failed: d.failed ?? 0 });
      await loadAudit();
    } catch { /* ignore */ }
    finally { setCleanupLoading(false); }
  };

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <Icon name="Ghost" size={15} className="text-amber-500" /> Аудит сиротских фото
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Фото загруженные но не прикреплённые ни к одному объекту</p>
        </div>
        <button onClick={loadAudit} disabled={auditLoading}
          className="text-sm px-4 py-2 rounded-xl border border-border hover:bg-muted font-medium inline-flex items-center gap-2 disabled:opacity-60">
          <Icon name={auditLoading ? 'Loader2' : 'ScanSearch'} size={14} className={auditLoading ? 'animate-spin' : ''} />
          {auditLoading ? 'Загрузка…' : 'Проверить'}
        </button>
      </div>

      {audit && (
        <div className="space-y-3">
          {/* Статистика */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Отслеживается', value: audit.photo_refs.total_tracked, color: 'text-foreground' },
              { label: 'Прикреплено', value: audit.photo_refs.attached, color: 'text-emerald-600' },
              { label: 'Сиротских', value: audit.photo_refs.orphan_total, color: audit.photo_refs.orphan_total > 0 ? 'text-amber-600' : 'text-emerald-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 bg-muted/30 rounded-xl border border-border text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {audit.photo_refs.orphan_ready > 0 && (
            <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
              <Icon name="AlertCircle" size={15} className="shrink-0 text-amber-500" />
              <span><b>{audit.photo_refs.orphan_ready}</b> сиротских фото готовы к удалению (старше 24ч)</span>
            </div>
          )}

          {audit.photo_refs.orphan_fresh > 0 && (
            <div className="px-3 py-2 bg-muted/30 border border-border rounded-xl text-xs text-muted-foreground flex items-center gap-2">
              <Icon name="Clock" size={13} />
              {audit.photo_refs.orphan_fresh} свежих фото — загружены менее 24 часов назад, будут защищены от удаления
            </div>
          )}

          {audit.photo_refs.orphan_total === 0 && (
            <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
              <Icon name="CheckCircle2" size={15} />
              Сиротских фото нет — всё чисто
            </div>
          )}

          {/* Последние прогоны */}
          {audit.cleanup_history.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">История очистки</div>
              {audit.cleanup_history.slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-muted/30 rounded-xl border border-border">
                  <span className="text-muted-foreground">{new Date(h.run_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <div className="flex items-center gap-2">
                    {h.status === 'dry_run' ? (
                      <span className="text-muted-foreground">пробный: {h.orphan_s3} найдено</span>
                    ) : (
                      <span className={h.removed_s3 > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>
                        удалено: {h.removed_s3}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      h.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                      : h.status === 'dry_run' ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>{h.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Кнопки */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => runCleanup('dry_run')} disabled={cleanupLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Icon name={cleanupLoading ? 'Loader2' : 'Eye'} size={14} className={cleanupLoading ? 'animate-spin' : ''} />
              Пробный прогон
            </button>
            {audit.photo_refs.orphan_ready > 0 && (
              <button onClick={() => runCleanup('run')} disabled={cleanupLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                <Icon name={cleanupLoading ? 'Loader2' : 'Trash2'} size={14} className={cleanupLoading ? 'animate-spin' : ''} />
                Удалить {audit.photo_refs.orphan_ready} сиротских
              </button>
            )}
          </div>

          {cleanupResult && (
            <div className={`px-3 py-2.5 rounded-xl text-sm border flex items-center gap-2 ${
              cleanupResult.removed > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted/40 border-border text-muted-foreground'
            }`}>
              <Icon name="CheckCircle2" size={15} />
              Удалено: {cleanupResult.removed} фото{cleanupResult.failed > 0 ? ` · Ошибок: ${cleanupResult.failed}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
