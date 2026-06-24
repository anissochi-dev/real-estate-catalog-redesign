import { useEffect, useRef, useState } from 'react';
import { adminApi, Role, uploadFile } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';

interface U {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

const ROLES: { id: Role; label: string }[] = [
  { id: 'admin', label: 'Администратор' },
  { id: 'editor', label: 'Редактор' },
  { id: 'manager', label: 'Менеджер' },
  { id: 'broker', label: 'Брокер' },
  { id: 'office_manager', label: 'Офис-менеджер' },
  { id: 'director', label: 'Директор' },
  { id: 'client', label: 'Клиент' },
];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700',
  director: 'bg-blue-100 text-blue-700',
  editor: 'bg-sky-100 text-sky-700',
  manager: 'bg-emerald-100 text-emerald-700',
  broker: 'bg-amber-100 text-amber-700',
  office_manager: 'bg-orange-100 text-orange-700',
  client: 'bg-slate-100 text-slate-600',
};

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [users, setUsers] = useState<U[]>([]);
  const [editing, setEditing] = useState<(Partial<U> & { password?: string }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const [roleChanging, setRoleChanging] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<U | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => adminApi.listUsers().then(d => setUsers(d.users));

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await adminApi.deleteUser(deleteConfirm.id);
      setUsers(prev => prev.filter(u => u.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: Role) => {
    setRoleChanging(userId);
    try {
      await adminApi.updateUser(userId, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch {
      alert('Ошибка изменения роли');
    } finally {
      setRoleChanging(null);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        const payload: Record<string, unknown> = {
          name: editing.name,
          role: editing.role,
          is_active: editing.is_active,
          phone: editing.phone,
          avatar: editing.avatar,
        };
        if (editing.password) payload.password = editing.password;
        await adminApi.updateUser(editing.id, payload);
        setLastCreated(null);
      } else {
        await adminApi.createUser({
          email: editing.email,
          name: editing.name,
          role: editing.role || 'broker',
          password: editing.password,
          phone: editing.phone,
          avatar: editing.avatar,
        });
        setLastCreated({
          email: editing.email || '',
          password: editing.password || '',
          name: editing.name || '',
        });
      }
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert((e instanceof Error ? e.message : 'Ошибка'));
    }
  };

  const copyInvite = (email: string, password: string, name: string, id?: number) => {
    const url = window.location.origin;
    const text = `Добро пожаловать, ${name}!\n\nВаши данные для входа:\nСайт: ${url}\nЛогин: ${email}\nПароль: ${password}\n\nДля входа нажмите «Войти» на сайте.`;
    navigator.clipboard.writeText(text).then(() => {
      if (id) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }
    });
  };

  const handleAvatar = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file, 'photos');
      setEditing(prev => prev ? { ...prev, avatar: url } : prev);
    } catch {
      alert('Ошибка загрузки фото');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Всего: {users.length}</div>
        <button onClick={() => { setLastCreated(null); setEditing({ role: 'broker', is_active: true }); }}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="UserPlus" size={16} /> Добавить
        </button>
      </div>

      {lastCreated && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <Icon name="CheckCircle2" size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-emerald-800 text-sm mb-1">Брокер создан успешно!</div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              <div>Логин: <span className="font-mono font-semibold">{lastCreated.email}</span></div>
              <div>Пароль: <span className="font-mono font-semibold">{lastCreated.password}</span></div>
            </div>
          </div>
          <button
            onClick={() => copyInvite(lastCreated.email, lastCreated.password, lastCreated.name)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
          >
            <Icon name="Copy" size={13} />
            Скопировать приглашение
          </button>
        </div>
      )}

      <>
      {/* Мобильный вид */}
      <div className="sm:hidden bg-white rounded-2xl shadow-sm divide-y divide-border">
        {users.map(u => (
          <div key={u.id} className="px-4 py-3 flex items-center gap-3">
            <div className="shrink-0">
              {u.avatar ? (
                <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center">
                  <Icon name="User" size={18} className="text-brand-blue" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm truncate">{u.name}</div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditing(u)} className="text-brand-blue">
                    <Icon name="Pencil" size={16} />
                  </button>
                  {isAdmin && me?.id !== u.id && u.role !== 'admin' && (
                    <button onClick={() => setDeleteConfirm(u)} className="text-red-400 hover:text-red-600">
                      <Icon name="Trash2" size={16} />
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
                      onChange={e => handleRoleChange(u.id, e.target.value as Role)}
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
                <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {u.is_active ? 'Активен' : 'Отключён'}
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
            {users.map(u => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-brand-blue/10 flex items-center justify-center">
                      <Icon name="User" size={16} className="text-brand-blue" />
                    </div>
                  )}
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
                  {isAdmin ? (
                    <div className="relative inline-block">
                      {roleChanging === u.id ? (
                        <span className="text-xs text-muted-foreground">Сохранение...</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value as Role)}
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
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_active ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => copyInvite(u.email, '••••••', u.name, u.id)}
                      title="Скопировать приглашение (без пароля)"
                      className="text-muted-foreground hover:text-emerald-600 transition-colors"
                    >
                      <Icon name={copiedId === u.id ? 'Check' : 'Copy'} size={15} />
                    </button>
                    <button onClick={() => setEditing(u)} className="text-brand-blue hover:text-brand-blue/70">
                      <Icon name="Pencil" size={16} />
                    </button>
                    {isAdmin && me?.id !== u.id && u.role !== 'admin' && (
                      <button
                        onClick={() => setDeleteConfirm(u)}
                        title="Удалить пользователя"
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Icon name="Trash2" size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать сотрудника' : 'Новый пользователь'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Аватар */}
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  {editing.avatar ? (
                    <img src={editing.avatar} alt="Фото" className="w-20 h-20 rounded-full object-cover border-2 border-border" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-border">
                      <Icon name="User" size={28} className="text-muted-foreground" />
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Icon name="Camera" size={14} />
                    {uploading ? 'Загрузка...' : 'Загрузить фото'}
                  </button>
                  {editing.avatar && (
                    <button
                      onClick={() => setEditing(prev => prev ? { ...prev, avatar: null } : prev)}
                      className="px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors"
                    >
                      Удалить фото
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatar(f); }}
                  />
                </div>
              </div>

              {editing.id ? (
                <div className="w-full px-3 py-2 border rounded-lg bg-muted/40 flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="Mail" size={14} />
                  <span className="select-all">{editing.email}</span>
                </div>
              ) : (
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email" type="email"
                  value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
              )}
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Имя и фамилия"
                value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <div>
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="Телефон (+7...)"
                  value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <span className="text-brand-blue">★</span>
                  Телефон отображается в карточке объекта как контакт представителя собственника
                </p>
              </div>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.role || 'client'}
                onChange={e => setEditing({ ...editing, role: e.target.value as Role })}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm" type="text"
                    placeholder={editing.id ? 'Новый пароль (если меняем)' : 'Пароль'}
                    value={editing.password || ''} onChange={e => setEditing({ ...editing, password: e.target.value })} />
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, password: generatePassword() })}
                    title="Сгенерировать пароль"
                    className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm flex items-center gap-1.5 text-muted-foreground hover:text-foreground whitespace-nowrap"
                  >
                    <Icon name="Shuffle" size={14} />
                    Сгенерировать
                  </button>
                </div>
                {!editing.id && editing.password && (
                  <p className="text-[11px] text-muted-foreground pl-1">Запомните или скопируйте пароль — после сохранения он не отображается</p>
                )}
              </div>
              {editing.id && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!editing.is_active}
                    onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                  Аккаунт активен
                </label>
              )}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">Отмена</button>
              <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Icon name="Trash2" size={20} className="text-red-600" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Удалить пользователя?</div>
                <div className="text-sm text-muted-foreground mt-0.5">Это действие необратимо</div>
              </div>
            </div>
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
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Icon name="Loader2" size={14} className="animate-spin" />}
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}