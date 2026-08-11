import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const PLATFORM_LABEL: Record<string, string> = {
  cian: 'Циан',
  domclick: 'ДомКлик',
  yandex: 'Яндекс.Недвижимость',
  avito: 'Авито',
};

interface ExportRequestRow {
  id: number;
  listing_id: number;
  listing_title: string | null;
  listing_address: string | null;
  listing_image: string | null;
  broker_name: string | null;
  platforms: string[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface Props {
  onClose: () => void;
  onHandled: () => void;
  onOpenListing?: (id: number) => void;
}

export default function ExportRequestsModal({ onClose, onHandled, onOpenListing }: Props) {
  const [items, setItems] = useState<ExportRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const load = () => {
    setLoading(true);
    adminApi.listExportRequests('pending')
      .then(r => setItems(r.items || []))
      .catch(() => toast.error('Не удалось загрузить заявки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const approve = async (id: number) => {
    setProcessingId(id);
    try {
      await adminApi.approveExportRequest(id);
      toast.success('Заявка одобрена — объект будет выгружен на выбранные площадки');
      setItems(list => list.filter(it => it.id !== id));
      onHandled();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка при одобрении');
    } finally {
      setProcessingId(null);
    }
  };

  const reject = async (id: number) => {
    setProcessingId(id);
    try {
      await adminApi.rejectExportRequest(id, rejectComment.trim() || undefined);
      toast.success('Заявка отклонена');
      setItems(list => list.filter(it => it.id !== id));
      setRejectingId(null);
      setRejectComment('');
      onHandled();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка при отклонении');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="UploadCloud" size={18} className="text-brand-blue" />
            <span className="font-display font-700 text-base">Запросы на платную выгрузку</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Icon name="Loader2" size={22} className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Icon name="CheckCircle2" size={28} className="mx-auto mb-2 opacity-30" />
              Новых заявок нет
            </div>
          ) : (
            items.map(it => (
              <div key={it.id} className="border border-border rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                    {it.listing_image ? (
                      <img src={it.listing_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="Building2" size={16} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => onOpenListing?.(it.listing_id)}
                      className="text-sm font-semibold text-left hover:text-brand-blue hover:underline truncate block w-full"
                      title={it.listing_title || ''}
                    >
                      {it.listing_title || `Объект #${it.listing_id}`}
                    </button>
                    <div className="text-xs text-muted-foreground truncate">{it.listing_address}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Брокер: {it.broker_name || '—'}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {it.platforms.map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-medium">
                      {PLATFORM_LABEL[p] || p}
                    </span>
                  ))}
                </div>

                {rejectingId === it.id ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={rejectComment}
                      onChange={e => setRejectComment(e.target.value)}
                      placeholder="Причина отказа (необязательно)"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => reject(it.id)}
                        disabled={processingId === it.id}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50"
                      >
                        Подтвердить отказ
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectComment(''); }}
                        className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(it.id)}
                      disabled={processingId === it.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Icon name="CheckCircle" size={12} /> Одобрить
                    </button>
                    <button
                      onClick={() => setRejectingId(it.id)}
                      disabled={processingId === it.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50"
                    >
                      <Icon name="X" size={12} /> Отклонить
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
