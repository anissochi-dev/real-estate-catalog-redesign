import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { formatPrice } from '@/lib/formatPrice';

const ADMIN_URL =
  'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';

interface ModerationItem {
  id: number;
  title: string;
  category: string;
  deal: string;
  price: number;
  area: number;
  address: string;
  image: string;
  owner_name: string;
  owner_phone: string;
  moderation_comment: string | null;
  created_at: string;
  owner_user_id: number | null;
  owner_user_name: string | null;
  owner_user_email: string | null;
}

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('biznest_token') ?? '';
  return {
    'Content-Type': 'application/json',
    'X-Auth-Token': token,
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ModerationTab() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{
    item: ModerationItem;
    comment: string;
  } | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  const loadItems = () => {
    setLoading(true);
    fetch(`${ADMIN_URL}?resource=moderation`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleApprove = (id: number) => {
    setProcessing(id);
    fetch(`${ADMIN_URL}?resource=moderation&id=${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ action: 'approve' }),
    })
      .then(() => loadItems())
      .catch(() => {})
      .finally(() => setProcessing(null));
  };

  const handleReject = (id: number, comment: string) => {
    setProcessing(id);
    setRejectModal(null);
    fetch(`${ADMIN_URL}?resource=moderation&id=${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ action: 'reject', comment }),
    })
      .then(() => loadItems())
      .catch(() => {})
      .finally(() => setProcessing(null));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Icon name="Loader2" size={32} className="animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Icon
              name="CheckCircle2"
              size={40}
              className="mx-auto mb-3 text-emerald-400"
            />
            <p className="text-gray-500 font-medium">
              Нет объектов на модерации
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Все объекты проверены
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
            >
              {/* Фото + основная инфо */}
              <div className="flex gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon
                        name="ImageOff"
                        size={20}
                        className="text-gray-300"
                      />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {item.address}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatPrice(item.price, item.deal)}
                    </span>
                    {item.area > 0 && (
                      <span className="text-xs text-gray-400">
                        {item.area} м²
                      </span>
                    )}
                    <span className="text-xs text-gray-400 capitalize">
                      {item.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* Собственник */}
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Icon name="User" size={12} className="flex-shrink-0" />
                  <span className="font-medium text-gray-700">
                    {item.owner_name}
                  </span>
                  {item.owner_user_name && (
                    <span className="text-gray-400">
                      ({item.owner_user_name})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Icon name="Phone" size={12} className="flex-shrink-0" />
                  <span>{item.owner_phone}</span>
                </div>
                {item.owner_user_email && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon name="Mail" size={12} className="flex-shrink-0" />
                    <span>{item.owner_user_email}</span>
                  </div>
                )}
              </div>

              {/* Дата подачи */}
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Icon name="Calendar" size={12} />
                <span>Подано: {formatDate(item.created_at)}</span>
              </div>

              {/* Кнопки */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(item.id)}
                  disabled={processing === item.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {processing === item.id ? (
                    <Icon name="Loader2" size={14} className="animate-spin" />
                  ) : (
                    <Icon name="Check" size={14} />
                  )}
                  Одобрить
                </button>
                <button
                  onClick={() =>
                    setRejectModal({ item, comment: '' })
                  }
                  disabled={processing === item.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {processing === item.id ? (
                    <Icon name="Loader2" size={14} className="animate-spin" />
                  ) : (
                    <Icon name="X" size={14} />
                  )}
                  Отклонить
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Модальное окно отклонения */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-lg">
                Причина отклонения
              </h3>
              <button
                onClick={() => setRejectModal(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Icon name="X" size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-500 truncate">
              {rejectModal.item.title}
            </p>

            <textarea
              value={rejectModal.comment}
              onChange={(e) =>
                setRejectModal((prev) =>
                  prev ? { ...prev, comment: e.target.value } : prev,
                )
              }
              placeholder="Укажите причину отклонения..."
              rows={4}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() =>
                  handleReject(rejectModal.item.id, rejectModal.comment)
                }
                disabled={!rejectModal.comment.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
