import Icon from '@/components/ui/icon';
import { Role } from '@/lib/adminApi';
import { U, ROLES, ROLE_COLORS } from './usersTypes';

interface UsersListProps {
  visibleUsers: U[];
  tab: 'staff' | 'clients';
  isAdmin: boolean;
  meId: number | undefined;
  roleChanging: number | null;
  accessToggling: number | null;
  copiedId: number | null;
  onOpenProfile: (u: U) => void;
  onEdit: (u: U) => void;
  onRoleChange: (userId: number, newRole: Role) => void;
  onGrantAccess: (u: U) => void;
  onRevokeAccess: (u: U) => void;
  onCopyInvite: (email: string, password: string, name: string, id?: number) => void;
}

export default function UsersList({
  visibleUsers,
  tab,
  isAdmin,
  meId,
  roleChanging,
  accessToggling,
  copiedId,
  onOpenProfile,
  onEdit,
  onRoleChange,
  onGrantAccess,
  onRevokeAccess,
  onCopyInvite,
}: UsersListProps) {
  return (
    <>
      {/* Мобильный вид */}
      <div className="sm:hidden bg-white rounded-2xl shadow-sm divide-y divide-border">
        {visibleUsers.map(u => (
          <div
            key={u.id}
            className={`px-4 py-3 flex items-center gap-3 ${u.is_archived ? 'opacity-60' : ''}`}
          >
            <div className="shrink-0 relative">
              {u.avatar ? (
                <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center">
                  <Icon name="User" size={18} className="text-brand-blue" />
                </div>
              )}
              {u.is_archived && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
                  <Icon name="Archive" size={9} className="text-white" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm truncate">{u.name}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.role === 'client' && isAdmin && !u.is_archived && (
                    u.is_active ? (
                      <button
                        onClick={() => onRevokeAccess(u)}
                        disabled={accessToggling === u.id}
                        title="Закрыть доступ к кабинету"
                        className="text-emerald-600 hover:text-red-500"
                      >
                        <Icon name={accessToggling === u.id ? 'Loader2' : 'ShieldCheck'} size={15} className={accessToggling === u.id ? 'animate-spin' : ''} />
                      </button>
                    ) : (
                      <button
                        onClick={() => onGrantAccess(u)}
                        disabled={accessToggling === u.id}
                        title="Дать доступ к кабинету"
                        className="text-amber-500 hover:text-emerald-600"
                      >
                        <Icon name={accessToggling === u.id ? 'Loader2' : 'ShieldOff'} size={15} className={accessToggling === u.id ? 'animate-spin' : ''} />
                      </button>
                    )
                  )}
                  <button onClick={() => onEdit(u)} className="text-brand-blue" title="Редактировать">
                    <Icon name="Pencil" size={15} />
                  </button>
                  {isAdmin && meId !== u.id && u.role !== 'admin' && (
                    <button
                      onClick={() => onOpenProfile(u)}
                      title="Профиль: объекты, заявки, архив/удаление"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="MoreHorizontal" size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                {u.phone && <div className="flex items-center gap-1"><Icon name="Phone" size={10} />{u.phone}</div>}
                <div className="flex items-center gap-1"><Icon name="Mail" size={10} />{u.email}</div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {isAdmin ? (
                  roleChanging === u.id ? (
                    <span className="text-xs text-muted-foreground">Сохранение...</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={e => onRoleChange(u.id, e.target.value as Role)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer appearance-none ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  )
                ) : (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                    {ROLES.find(r => r.id === u.role)?.label}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded ${u.is_archived ? 'bg-gray-100 text-gray-500' : u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {u.is_archived ? 'В архиве' : u.is_active ? 'Активен' : 'Отключён'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Десктопный вид */}
      <div className="hidden sm:block bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3">Фото</th>
              <th className="px-4 py-3">Имя / Email</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map(u => (
              <tr key={u.id} className={`border-t border-border hover:bg-muted/30 ${u.is_archived ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="relative inline-block">
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brand-blue/10 flex items-center justify-center">
                        <Icon name="User" size={16} className="text-brand-blue" />
                      </div>
                    )}
                    {u.is_archived && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center">
                        <Icon name="Archive" size={9} className="text-white" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold leading-tight">{u.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Icon name="Mail" size={11} />
                    {u.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.phone ? (
                    <span className="text-foreground">{u.phone}</span>
                  ) : (
                    <span className="text-amber-500 text-xs flex items-center gap-1">
                      <Icon name="AlertCircle" size={12} />
                      Не указан
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isAdmin && !u.is_archived ? (
                    <div className="relative inline-block">
                      {roleChanging === u.id ? (
                        <span className="text-xs text-muted-foreground">Сохранение...</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={e => onRoleChange(u.id, e.target.value as Role)}
                          className={`text-xs font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer appearance-none pr-5 ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          {ROLES.map(r => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ) : (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ROLES.find(r => r.id === u.role)?.label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_archived ? 'bg-gray-100 text-gray-500' : u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_archived ? 'В архиве' : u.is_active ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {u.role === 'client' && isAdmin && !u.is_archived ? (
                      u.is_active ? (
                        <button
                          onClick={() => onRevokeAccess(u)}
                          disabled={accessToggling === u.id}
                          title="Закрыть доступ к кабинету"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600"
                        >
                          <Icon name={accessToggling === u.id ? 'Loader2' : 'ShieldCheck'} size={13} className={accessToggling === u.id ? 'animate-spin' : ''} />
                          Доступ открыт
                        </button>
                      ) : (
                        <button
                          onClick={() => onGrantAccess(u)}
                          disabled={accessToggling === u.id}
                          title="Дать доступ к личному кабинету"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors bg-amber-50 text-amber-700 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Icon name={accessToggling === u.id ? 'Loader2' : 'ShieldOff'} size={13} className={accessToggling === u.id ? 'animate-spin' : ''} />
                          Дать доступ
                        </button>
                      )
                    ) : u.role !== 'client' ? (
                      <button
                        onClick={() => onCopyInvite(u.email, '••••••', u.name, u.id)}
                        title="Скопировать приглашение (без пароля)"
                        className="text-muted-foreground hover:text-emerald-600 transition-colors"
                      >
                        <Icon name={copiedId === u.id ? 'Check' : 'Copy'} size={15} />
                      </button>
                    ) : null}
                    <button onClick={() => onEdit(u)} className="text-brand-blue hover:text-brand-blue/70" title="Редактировать">
                      <Icon name="Pencil" size={16} />
                    </button>
                    {isAdmin && meId !== u.id && u.role !== 'admin' && (
                      <button
                        onClick={() => onOpenProfile(u)}
                        title="Профиль: объекты, заявки, архив/удаление"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Icon name="MoreHorizontal" size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visibleUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  <Icon name="Users" size={32} className="mx-auto mb-2 text-muted-foreground/40" />
                  {tab === 'clients' ? 'Собственников пока нет — они появятся после подачи объекта через форму на сайте' : 'Нет сотрудников'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
