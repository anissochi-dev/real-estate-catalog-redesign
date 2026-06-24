import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { formatPrice } from '@/lib/formatPrice';
import { U, ROLES, ROLE_COLORS, UserProfileData } from './usersTypes';

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен', moderation: 'Модерация', archived: 'Архив',
  rejected: 'Отклонён', draft: 'Черновик',
};
const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Новая', in_progress: 'В работе', done: 'Завершена', rejected: 'Отклонена',
};
const DEAL_STATUS_LABELS: Record<string, string> = {
  new: 'Новая', in_progress: 'В работе', won: 'Выиграна', lost: 'Проиграна',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

interface UserProfileModalProps {
  user: U;
  users: U[];                       // весь список — для выбора получателя
  isAdmin: boolean;
  onClose: () => void;
  onArchived: (userId: number) => void;
  onDeleted: (userId: number) => void;
}

type Action = 'archive' | 'delete';

export default function UserProfileModal({
  user: targetUser,
  users,
  isAdmin,
  onClose,
  onArchived,
  onDeleted,
}: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [toUserId, setToUserId] = useState<number | ''>('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminApi.getUserProfile(targetUser.id)
      .then((d: UserProfileData) => setProfile(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetUser.id]);

  const recipientOptions = users.filter(
    u => u.id !== targetUser.id && u.role !== 'client' && u.is_active && !u.is_archived,
  );

  const hasData = profile && (profile.stats.total_listings > 0 || profile.stats.total_leads > 0 || profile.stats.total_deals > 0);

  const handleConfirmAction = async () => {
    if (!action) return;
    setProcessing(true);
    try {
      const tid = toUserId ? Number(toUserId) : undefined;
      if (action === 'archive') {
        await adminApi.archiveUser(targetUser.id, tid);
        onArchived(targetUser.id);
      } else {
        await adminApi.deleteUser(targetUser.id, tid);
        onDeleted(targetUser.id);
      }
      onClose();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Шапка */}
        <div className="flex items-center gap-3 p-5 border-b border-border shrink-0">
          <div className="relative shrink-0">
            {targetUser.avatar ? (
              <img src={targetUser.avatar} alt={targetUser.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center">
                <Icon name="User" size={22} className="text-brand-blue" />
              </div>
            )}
            {targetUser.is_archived && (
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center">
                <Icon name="Archive" size={10} className="text-white" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground truncate">{targetUser.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Icon name="Mail" size={11} />{targetUser.email}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[targetUser.role] ?? 'bg-slate-100 text-slate-600'}`}>
                {ROLES.find(r => r.id === targetUser.role)?.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${targetUser.is_archived ? 'bg-gray-100 text-gray-500' : targetUser.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {targetUser.is_archived ? 'В архиве' : targetUser.is_active ? 'Активен' : 'Отключён'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Тело */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Icon name="Loader2" size={28} className="animate-spin" />
            </div>
          ) : profile ? (
            <>
              {/* Счётчики */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Объектов', value: profile.stats.total_listings, icon: 'Building2', active: profile.stats.active_listings },
                  { label: 'Заявок', value: profile.stats.total_leads, icon: 'FileText', active: profile.stats.new_leads },
                  { label: 'Сделок', value: profile.stats.total_deals, icon: 'Briefcase', active: null },
                ].map(s => (
                  <div key={s.label} className="bg-muted rounded-xl p-3 text-center">
                    <Icon name={s.icon} size={18} className="mx-auto mb-1 text-muted-foreground" />
                    <div className="text-xl font-bold text-foreground">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    {s.active !== null && s.active > 0 && (
                      <div className="text-[10px] text-emerald-600 font-medium mt-0.5">{s.active} активных</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Объекты */}
              {profile.listings.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Icon name="Building2" size={14} className="text-muted-foreground" />
                    Объекты ({profile.listings.length})
                  </div>
                  <div className="space-y-1.5">
                    {profile.listings.slice(0, 8).map(l => (
                      <div key={l.id} className="flex items-center gap-3 bg-muted/50 rounded-xl px-3 py-2">
                        {l.image ? (
                          <img src={l.image} alt={l.title} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Icon name="ImageOff" size={12} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{l.title}</div>
                          <div className="text-[11px] text-muted-foreground">{formatPrice(l.price, l.deal)} · {l.area} м²</div>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${l.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                      </div>
                    ))}
                    {profile.listings.length > 8 && (
                      <div className="text-xs text-muted-foreground text-center py-1">ещё {profile.listings.length - 8}...</div>
                    )}
                  </div>
                </div>
              )}

              {/* Заявки */}
              {profile.leads.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Icon name="FileText" size={14} className="text-muted-foreground" />
                    Заявки ({profile.leads.length})
                  </div>
                  <div className="space-y-1.5">
                    {profile.leads.slice(0, 6).map(l => (
                      <div key={l.id} className="flex items-center gap-3 bg-muted/50 rounded-xl px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{l.name}</div>
                          <div className="text-[11px] text-muted-foreground">{l.phone} · {fmt(l.created_at)}</div>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${l.status === 'new' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                          {LEAD_STATUS_LABELS[l.status] ?? l.status}
                        </span>
                      </div>
                    ))}
                    {profile.leads.length > 6 && (
                      <div className="text-xs text-muted-foreground text-center py-1">ещё {profile.leads.length - 6}...</div>
                    )}
                  </div>
                </div>
              )}

              {/* CRM-сделки */}
              {profile.deals.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Icon name="Briefcase" size={14} className="text-muted-foreground" />
                    Сделки CRM ({profile.deals.length})
                  </div>
                  <div className="space-y-1.5">
                    {profile.deals.slice(0, 5).map(d => (
                      <div key={d.id} className="flex items-center gap-3 bg-muted/50 rounded-xl px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{d.name}</div>
                          {d.amount && <div className="text-[11px] text-muted-foreground">{(d.amount / 1000).toFixed(0)} тыс ₽</div>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${d.status === 'won' ? 'bg-emerald-100 text-emerald-700' : d.status === 'lost' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                          {DEAL_STATUS_LABELS[d.status] ?? d.status}
                        </span>
                      </div>
                    ))}
                    {profile.deals.length > 5 && (
                      <div className="text-xs text-muted-foreground text-center py-1">ещё {profile.deals.length - 5}...</div>
                    )}
                  </div>
                </div>
              )}

              {!hasData && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Icon name="Inbox" size={28} className="mx-auto mb-2 opacity-40" />
                  Нет привязанных объектов, заявок или сделок
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">Не удалось загрузить данные</div>
          )}
        </div>

        {/* Действия */}
        {isAdmin && !targetUser.is_archived && (
          <div className="p-5 border-t border-border shrink-0 space-y-3">
            {/* Выбор получателя (показывается если выбрано действие и есть данные) */}
            {action && hasData && (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Передать объекты, заявки и сделки</div>
                <div className="text-xs text-muted-foreground">Необязательно — без выбора данные останутся без ответственного</div>
                <select
                  value={toUserId}
                  onChange={e => setToUserId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-blue"
                >
                  <option value="">— Не передавать —</option>
                  {recipientOptions.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLES.find(r => r.id === u.role)?.label ?? u.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Кнопки действий */}
            {!action ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setAction('archive')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Icon name="Archive" size={15} />
                  Архивировать
                </button>
                <button
                  onClick={() => setAction('delete')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <Icon name="Trash2" size={15} />
                  Удалить
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className={`flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 ${action === 'delete' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  <Icon name={action === 'delete' ? 'TriangleAlert' : 'Archive'} size={15} className="shrink-0 mt-0.5" />
                  {action === 'delete'
                    ? 'Удаление необратимо. Пользователь и его данные будут удалены из системы.'
                    : 'Пользователь будет деактивирован. Данные сохранятся, доступ будет закрыт.'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAction(null); setToUserId(''); }}
                    disabled={processing}
                    className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleConfirmAction}
                    disabled={processing}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${action === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'}`}
                  >
                    {processing && <Icon name="Loader2" size={14} className="animate-spin" />}
                    {action === 'delete' ? 'Удалить' : 'Архивировать'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
