import { useEffect, useState } from 'react';
import { adminApi, Role } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';
import { U } from './users/usersTypes';
import UsersList from './users/UsersList';
import UserEditModal from './users/UserEditModal';
import UserProfileModal from './users/UserProfileModal';

type EditingUser = Partial<U> & { password?: string };

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [users, setUsers] = useState<U[]>([]);
  const [editing, setEditing] = useState<EditingUser | null>(null);
  const [uploading, setUploading] = useState(false);
  const [roleChanging, setRoleChanging] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string; name: string } | null>(null);
  const [profileUser, setProfileUser] = useState<U | null>(null);
  const [accessToggling, setAccessToggling] = useState<number | null>(null);
  const [tab, setTab] = useState<'staff' | 'clients'>('staff');

  const staffUsers = users.filter(u => u.role !== 'client');
  const clientUsers = users.filter(u => u.role === 'client');
  const visibleUsers = tab === 'staff' ? staffUsers : clientUsers;
  const pendingClients = clientUsers.filter(u => !u.is_active && !u.is_archived).length;

  const handleGrantAccess = async (u: U) => {
    setAccessToggling(u.id);
    try {
      const res = await adminApi.grantAccess(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: true } : x));
      if (res?.credentials_sent) {
        // пароль отправлен в MAX
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка выдачи доступа');
    } finally {
      setAccessToggling(null);
    }
  };

  const handleRevokeAccess = async (u: U) => {
    if (!confirm(`Закрыть доступ к кабинету для ${u.name}?`)) return;
    setAccessToggling(u.id);
    try {
      await adminApi.revokeAccess(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: false } : x));
    } catch {
      alert('Ошибка отзыва доступа');
    } finally {
      setAccessToggling(null);
    }
  };

  const load = () => adminApi.listUsers().then(d => setUsers(d.users));

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Вкладки */}
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          <button
            onClick={() => setTab('staff')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'staff' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Сотрудники
            <span className="ml-1.5 text-xs text-muted-foreground">({staffUsers.length})</span>
          </button>
          <button
            onClick={() => setTab('clients')}
            className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'clients' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Собственники
            <span className="ml-1.5 text-xs text-muted-foreground">({clientUsers.length})</span>
            {pendingClients > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingClients}
              </span>
            )}
          </button>
        </div>
        <button onClick={() => { setLastCreated(null); setEditing({ role: 'broker', is_active: true }); }}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
          <Icon name="UserPlus" size={16} /> Добавить
        </button>
      </div>

      {/* Подсказка для вкладки собственников */}
      {tab === 'clients' && pendingClients > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <Icon name="Clock" size={16} className="shrink-0 mt-0.5 text-amber-500" />
          <span><b>{pendingClients}</b> собственник{pendingClients > 1 ? 'а' : ''} ожидает доступа к личному кабинету. Доступ открывается автоматически после одобрения объекта, или вручную кнопкой ниже.</span>
        </div>
      )}

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

      <UsersList
        visibleUsers={visibleUsers}
        tab={tab}
        isAdmin={isAdmin}
        meId={me?.id}
        roleChanging={roleChanging}
        accessToggling={accessToggling}
        copiedId={copiedId}
        onOpenProfile={setProfileUser}
        onEdit={setEditing}
        onRoleChange={handleRoleChange}
        onGrantAccess={handleGrantAccess}
        onRevokeAccess={handleRevokeAccess}
        onCopyInvite={copyInvite}
      />

      {editing && (
        <UserEditModal
          editing={editing}
          uploading={uploading}
          onClose={() => setEditing(null)}
          onSave={save}
          onChangeEditing={setEditing}
          onSetUploading={setUploading}
        />
      )}

      {profileUser && (
        <UserProfileModal
          user={profileUser}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setProfileUser(null)}
          onArchived={id => {
            setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: false, is_archived: true } : u));
            setProfileUser(null);
          }}
          onDeleted={id => {
            setUsers(prev => prev.filter(u => u.id !== id));
            setProfileUser(null);
          }}
        />
      )}
    </div>
  );
}
