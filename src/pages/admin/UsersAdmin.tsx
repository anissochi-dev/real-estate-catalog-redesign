import { useEffect, useRef, useState } from 'react';
import { adminApi, Role, uploadFile } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

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

export default function UsersAdmin() {
  const [users, setUsers] = useState<U[]>([]);
  const [editing, setEditing] = useState<(Partial<U> & { password?: string }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => adminApi.listUsers().then(d => setUsers(d.users));
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
      } else {
        await adminApi.createUser({
          email: editing.email,
          name: editing.name,
          role: editing.role || 'client',
          password: editing.password,
          phone: editing.phone,
          avatar: editing.avatar,
        });
      }
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert((e instanceof Error ? e.message : 'Ошибка'));
    }
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
        <button onClick={() => setEditing({ role: 'client', is_active: true })}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="UserPlus" size={16} /> Добавить
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3">Фото</th>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Email</th>
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
                <td className="px-4 py-3 font-semibold">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.phone || '—'}</td>
                <td className="px-4 py-3">{ROLES.find(r => r.id === u.role)?.label}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {u.is_active ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(u)} className="text-brand-blue hover:text-brand-blue/70">
                    <Icon name="Pencil" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

              {!editing.id && (
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email" type="email"
                  value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
              )}
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Имя и фамилия"
                value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Телефон (+7...)"
                value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.role || 'client'}
                onChange={e => setEditing({ ...editing, role: e.target.value as Role })}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <input className="w-full px-3 py-2 border rounded-lg" type="password"
                placeholder={editing.id ? 'Новый пароль (если меняем)' : 'Пароль'}
                value={editing.password || ''} onChange={e => setEditing({ ...editing, password: e.target.value })} />
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
    </div>
  );
}
