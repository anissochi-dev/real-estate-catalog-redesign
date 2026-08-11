import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { Spinner } from './TabOverview';

const PLATFORMS: { id: string; label: string; icon: string }[] = [
  { id: 'cian', label: 'Циан', icon: 'Building2' },
  { id: 'domclick', label: 'ДомКлик', icon: 'Home' },
  { id: 'yandex', label: 'Яндекс.Недвижимость', icon: 'MapPin' },
  { id: 'avito', label: 'Авито', icon: 'ShoppingBag' },
];

interface ExportRequestRow {
  id: number;
  listing_id: number;
  platforms: string[];
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  reviewed_by_name?: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  pending: { text: 'На рассмотрении', className: 'bg-amber-100 text-amber-700' },
  approved: { text: 'Одобрено', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { text: 'Отклонено', className: 'bg-red-100 text-red-700' },
};

export function TabExport({ listing }: { listing: Listing }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ExportRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isBroker = user?.role === 'broker';

  const load = () => {
    setLoading(true);
    adminApi.listExportRequests()
      .then(r => setHistory((r.items || []).filter((it: ExportRequestRow) => it.listing_id === listing.id)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [listing.id]);

  const alreadyExported = PLATFORMS.filter(p => (listing as unknown as Record<string, boolean>)[`export_${p.id}`]);
  const hasPending = history.some(h => h.status === 'pending');

  const toggle = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const submit = async () => {
    if (selected.length === 0) return;
    setSending(true);
    try {
      await adminApi.createExportRequest(listing.id, selected);
      toast.success('Запрос на выгрузку отправлен на согласование');
      setSelected([]);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить запрос');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="text-sm font-semibold mb-1">Уже выгружено</div>
        <div className="flex flex-wrap gap-1.5">
          {alreadyExported.length === 0 ? (
            <span className="text-sm text-muted-foreground">Нигде</span>
          ) : alreadyExported.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium">
              <Icon name={p.icon} size={12} /> {p.label}
            </span>
          ))}
        </div>
      </div>

      {isBroker && (
        <div>
          <div className="text-sm font-semibold mb-2">Запросить платную выгрузку</div>
          {hasPending ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
              <Icon name="Clock" size={15} className="shrink-0" />
              Уже есть заявка на рассмотрении — дождитесь решения директора/администратора.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map(p => {
                  const already = (listing as unknown as Record<string, boolean>)[`export_${p.id}`];
                  const isSelected = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={already}
                      onClick={() => toggle(p.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition ${
                        already ? 'opacity-40 cursor-not-allowed border-border bg-muted/30'
                        : isSelected ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <Icon name={isSelected ? 'CheckSquare' : 'Square'} size={15} className="shrink-0" />
                      <Icon name={p.icon} size={14} className="shrink-0" />
                      {p.label}
                      {already && <span className="ml-auto text-[10px]">уже есть</span>}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={submit}
                disabled={selected.length === 0 || sending}
                className="mt-3 btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {sending ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Send" size={15} />}
                Отправить запрос
              </button>
            </>
          )}
        </div>
      )}

      <div>
        <div className="text-sm font-semibold mb-2">История запросов</div>
        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground">Запросов ещё не было</div>
        ) : (
          <div className="space-y-2">
            {history.map(h => {
              const badge = STATUS_LABEL[h.status] || STATUS_LABEL.pending;
              return (
                <div key={h.id} className="border border-border rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                      {h.platforms.map(pid => {
                        const p = PLATFORMS.find(x => x.id === pid);
                        return (
                          <span key={pid} className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground font-medium">
                            {p?.label || pid}
                          </span>
                        );
                      })}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>{badge.text}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {new Date(h.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {h.reviewed_by_name ? ` · рассмотрел: ${h.reviewed_by_name}` : ''}
                  </div>
                  {h.comment && (
                    <div className="text-xs text-red-600 mt-1">Комментарий: {h.comment}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
