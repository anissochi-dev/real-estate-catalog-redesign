import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { storageCleanupApi, PendingInfo } from './storageCleanupApi';

interface Props {
  onChanged: (info: PendingInfo) => void;
}

function fmtDate(v: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function StorageCleanupPanel({ onChanged }: Props) {
  const [info, setInfo] = useState<PendingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState({ removed: 0, total: 0 });
  const [keeping, setKeeping] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const apply = (d: PendingInfo) => { setInfo(d); onChanged(d); };

  useEffect(() => {
    storageCleanupApi.pending()
      .then(apply)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDelete = async () => {
    if (!info) return;
    setConfirmOpen(false);
    setDeleting(true);
    setProgress({ removed: 0, total: info.ready });
    let removed = 0;
    let failed = 0;
    try {
      for (let i = 0; i < 100; i++) {
        const r = await storageCleanupApi.confirm();
        removed += r.removed;
        failed += r.failed;
        setProgress({ removed, total: info.ready });
        if (r.done || r.removed === 0) break;
      }
      toast.success(`Удалено файлов: ${removed}${failed ? `, не удалось: ${failed}` : ''}`);
      apply(await storageCleanupApi.pending());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const snooze = async () => {
    try {
      apply(await storageCleanupApi.snooze());
      toast.success('Напомню через месяц');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const keep = async (key: string) => {
    setKeeping(key);
    try {
      apply(await storageCleanupApi.keep(key));
      toast.success('Файл сохранён — очистка его больше не тронет');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setKeeping(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Icon name="Loader2" size={22} className="animate-spin" />
      </div>
    );
  }

  if (!info || info.ready === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Icon name="CheckCircle2" size={28} className="mx-auto mb-2 opacity-30" />
        Файлов к удалению нет
        {info?.last_cleanup_at && <div className="mt-1 text-xs">Последняя очистка: {fmtDate(info.last_cleanup_at)}</div>}
      </div>
    );
  }

  const pct = progress.total ? Math.min(100, Math.round((progress.removed / progress.total) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-sm">
        <div className="font-semibold text-amber-900">Готовы к удалению: {info.ready} файлов</div>
        <div className="text-amber-800/80 text-xs mt-1">
          Эти фото и документы больше нигде на сайте не используются и пролежали в карантине не меньше 7 дней.
          {info.last_cleanup_at && <> Последняя очистка: {fmtDate(info.last_cleanup_at)}.</>}
        </div>
      </div>

      {deleting ? (
        <div className="space-y-2">
          <div className="text-sm">Удаляю… {progress.removed} из {progress.total}. Не закрывайте окно.</div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-brand-blue transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : confirmOpen ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
          <div className="text-sm text-red-800">Удалить {info.ready} файлов без возможности восстановления?</div>
          <div className="flex gap-2">
            <button onClick={runDelete} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
              Да, удалить
            </button>
            <button onClick={() => setConfirmOpen(false)} className="px-3 py-2 rounded-lg bg-white border border-border text-sm hover:bg-muted">
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setConfirmOpen(true)} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 inline-flex items-center gap-1.5">
            <Icon name="Trash2" size={15} /> Удалить
          </button>
          <button onClick={snooze} className="px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-semibold hover:bg-muted/70 inline-flex items-center gap-1.5">
            <Icon name="Clock" size={15} /> Отложить на месяц
          </button>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Первые {info.sample.length} из {info.ready}. Нужное фото — нажмите «Сохранить», и очистка его никогда не тронет.
      </div>
      <div className="grid grid-cols-3 gap-2">
        {info.sample.map(f => {
          const isImg = /\.(jpe?g|png|webp|gif)$/i.test(f.key);
          return (
            <div key={f.key} className="relative rounded-lg overflow-hidden border border-border bg-muted aspect-square group">
              {isImg ? (
                <img src={f.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <a href={f.url} target="_blank" rel="noreferrer" className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-1">
                  <Icon name="FileText" size={22} />
                  <span className="text-[10px] truncate w-full text-center mt-1">{f.key.split('/').pop()}</span>
                </a>
              )}
              <button
                onClick={() => keep(f.key)}
                disabled={keeping === f.key || deleting}
                className="absolute bottom-1 left-1 right-1 py-1 rounded-md bg-white/95 text-[11px] font-semibold text-emerald-700 hover:bg-white shadow inline-flex items-center justify-center gap-1 disabled:opacity-60"
              >
                <Icon name={keeping === f.key ? 'Loader2' : 'ShieldCheck'} size={12} className={keeping === f.key ? 'animate-spin' : ''} />
                Сохранить
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
