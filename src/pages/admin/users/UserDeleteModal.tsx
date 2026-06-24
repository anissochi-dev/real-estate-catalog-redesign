import Icon from '@/components/ui/icon';
import { U, ROLES, ROLE_COLORS } from './usersTypes';

interface UserDeleteModalProps {
  deleteConfirm: U;
  users: U[];
  toUserId: number | null;
  deleting: boolean;
  onSetToUserId: (id: number | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function UserDeleteModal({
  deleteConfirm,
  users,
  toUserId,
  deleting,
  onSetToUserId,
  onConfirm,
  onCancel,
}: UserDeleteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl p-6 space-y-4">
        {/* Заголовок */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Icon name="Trash2" size={20} className="text-red-600" />
          </div>
          <div>
            <div className="font-semibold text-foreground">Удалить пользователя?</div>
            <div className="text-sm text-muted-foreground mt-0.5">Это действие необратимо</div>
          </div>
        </div>

        {/* Карточка удаляемого */}
        <div className="bg-muted rounded-xl px-4 py-3 text-sm space-y-1">
          <div className="font-semibold">{deleteConfirm.name}</div>
          <div className="text-muted-foreground flex items-center gap-1">
            <Icon name="Mail" size={12} />
            {deleteConfirm.email}
          </div>
          <div className="mt-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[deleteConfirm.role] ?? 'bg-slate-100 text-slate-600'}`}>
              {ROLES.find(r => r.id === deleteConfirm.role)?.label}
            </span>
          </div>
        </div>

        {/* Передача объектов и заявок */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Передать объекты и заявки другому сотруднику</div>
          <div className="text-xs text-muted-foreground">Необязательно — если не выбрать, данные останутся без ответственного</div>
          <select
            value={toUserId ?? ''}
            onChange={e => onSetToUserId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-blue"
          >
            <option value="">— Не передавать —</option>
            {users
              .filter(u => u.id !== deleteConfirm.id && u.role !== 'client' && u.is_active)
              .map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLES.find(r => r.id === u.role)?.label ?? u.role})
                </option>
              ))
            }
          </select>
        </div>

        {/* Кнопки */}
        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {deleting && <Icon name="Loader2" size={14} className="animate-spin" />}
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
