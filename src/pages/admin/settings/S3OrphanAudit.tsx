import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { getToken } from '@/lib/adminApi';

const PHOTO_CLEANUP_URL = 'https://functions.poehali.dev/98a2eda7-410c-4378-91b9-a2f195cc0dc2';

interface PhotoRefsStats {
  total_tracked: number;
  attached: number;
  in_quarantine: number;
  ready_to_delete: number;
  unchecked: number;
  next_delete_at: string | null;
}
interface AuditResult {
  photo_refs: PhotoRefsStats;
  cleanup_history: { run_at: string; orphan_s3: number; removed_s3: number; quarantine_s3: number | null; status: string }[];
}
interface CleanupResult {
  removed: number;
  failed: number;
  newly_quarantined: number;
  in_quarantine: number;
  left: number;
}

export default function S3OrphanAudit() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [cleanupError, setCleanupError] = useState('');

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${PHOTO_CLEANUP_URL}/?action=summary&token=${encodeURIComponent(token)}`);
      const d = await res.json();
      if (!d.error) setAudit(d);
    } catch { /* ignore */ }
    finally { setAuditLoading(false); }
  };

  const runCleanup = async (mode: 'dry_run' | 'run') => {
    if (mode === 'run' && !confirm('Удалить файлы, которые пролежали в карантине 7 дней и нигде на сайте не используются? Действие необратимо.')) return;
    setCleanupLoading(true);
    setCleanupResult(null);
    setCleanupError('');
    try {
      const token = getToken();
      const res = await fetch(`${PHOTO_CLEANUP_URL}/?action=${mode}&token=${encodeURIComponent(token)}`);
      const d = await res.json();
      if (d.error || d.errorMessage) setCleanupError(d.error || 'Проверка не удалась, попробуйте позже');
      else setCleanupResult({
        removed: d.removed ?? 0, failed: d.failed ?? 0, newly_quarantined: d.newly_quarantined ?? 0,
        in_quarantine: d.in_quarantine ?? 0, left: d.left ?? 0,
      });
      await loadAudit();
    } catch {
      setCleanupError('Проверка не удалась, попробуйте позже');
    } finally { setCleanupLoading(false); }
  };

  const fmt = (s: string) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <Icon name="Ghost" size={15} className="text-amber-500" /> Очистка хранилища
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Файлы, которые нигде на сайте не используются (например, фото удалённых объектов), сначала 7 дней лежат в карантине, затем ждут вашего подтверждения: раз в месяц в колокольчике появится напоминание с кнопкой «Удалить». Без подтверждения ничего не удаляется.
          </p>
        </div>
        <button onClick={loadAudit} disabled={auditLoading}
          className="text-sm px-4 py-2 rounded-xl border border-border hover:bg-muted font-medium inline-flex items-center gap-2 disabled:opacity-60">
          <Icon name={auditLoading ? 'Loader2' : 'ScanSearch'} size={14} className={auditLoading ? 'animate-spin' : ''} />
          {auditLoading ? 'Загрузка…' : 'Показать сводку'}
        </button>
      </div>

      {audit && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Используется', value: audit.photo_refs.attached, color: 'text-emerald-600' },
              { label: 'В карантине', value: audit.photo_refs.in_quarantine, color: audit.photo_refs.in_quarantine > 0 ? 'text-amber-600' : 'text-foreground' },
              { label: 'Готово к удалению', value: audit.photo_refs.ready_to_delete, color: audit.photo_refs.ready_to_delete > 0 ? 'text-red-600' : 'text-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 bg-muted/30 rounded-xl border border-border text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {audit.photo_refs.unchecked > 0 && (
            <div className="px-3 py-2 bg-muted/30 border border-border rounded-xl text-xs text-muted-foreground flex items-center gap-2">
              <Icon name="Info" size={13} />
              {audit.photo_refs.unchecked} файлов ещё не проверены — нажмите «Проверить сейчас» или дождитесь ночной проверки
            </div>
          )}

          {audit.photo_refs.in_quarantine > 0 && audit.photo_refs.next_delete_at && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <Icon name="Clock" size={13} className="shrink-0" />
              Первые файлы из карантина можно будет удалить (после вашего подтверждения) {fmt(audit.photo_refs.next_delete_at)}. Если файл снова начнёт использоваться, он автоматически выйдет из карантина.
            </div>
          )}

          {audit.cleanup_history.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">История проверок</div>
              {audit.cleanup_history.slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-muted/30 rounded-xl border border-border">
                  <span className="text-muted-foreground">{fmt(h.run_at)}</span>
                  <span className="text-muted-foreground">
                    в карантине: {h.quarantine_s3 ?? '—'} · удалено: <b className={h.removed_s3 > 0 ? 'text-amber-600' : ''}>{h.removed_s3}</b>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => runCleanup('dry_run')} disabled={cleanupLoading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Icon name={cleanupLoading ? 'Loader2' : 'RefreshCw'} size={14} className={cleanupLoading ? 'animate-spin' : ''} />
              Проверить сейчас
            </button>
            {audit.photo_refs.ready_to_delete > 0 && (
              <button onClick={() => runCleanup('run')} disabled={cleanupLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                <Icon name={cleanupLoading ? 'Loader2' : 'Trash2'} size={14} className={cleanupLoading ? 'animate-spin' : ''} />
                Удалить {audit.photo_refs.ready_to_delete} после карантина
              </button>
            )}
          </div>

          {cleanupResult && (
            <div className="px-3 py-2.5 rounded-xl text-sm border bg-muted/40 border-border text-foreground flex items-center gap-2">
              <Icon name="CheckCircle2" size={15} className="text-emerald-600 shrink-0" />
              <span>
                Проверено. В карантине: {cleanupResult.in_quarantine}
                {cleanupResult.newly_quarantined > 0 ? ` (новых: ${cleanupResult.newly_quarantined})` : ''}
                {cleanupResult.removed > 0 ? ` · Удалено: ${cleanupResult.removed}` : ''}
                {cleanupResult.left > 0 ? ` · Осталось удалить: ${cleanupResult.left}` : ''}
                {cleanupResult.failed > 0 ? ` · Ошибок: ${cleanupResult.failed}` : ''}
              </span>
            </div>
          )}
          {cleanupError && (
            <div className="px-3 py-2.5 rounded-xl text-sm border bg-red-50 border-red-200 text-red-700">{cleanupError}</div>
          )}
        </div>
      )}
    </div>
  );
}
