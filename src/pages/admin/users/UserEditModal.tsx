import { useRef } from 'react';
import { uploadFile, Role } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { U, ROLES, generatePassword } from './usersTypes';

type EditingUser = Partial<U> & { password?: string };

interface UserEditModalProps {
  editing: EditingUser;
  uploading: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeEditing: (next: EditingUser) => void;
  onSetUploading: (v: boolean) => void;
}

export default function UserEditModal({
  editing,
  uploading,
  onClose,
  onSave,
  onChangeEditing,
  onSetUploading,
}: UserEditModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatar = async (file: File) => {
    onSetUploading(true);
    try {
      const url = await uploadFile(file, 'photos');
      onChangeEditing({ ...editing, avatar: url });
    } catch {
      alert('Ошибка загрузки фото');
    } finally {
      onSetUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex justify-between items-center">
          <div className="font-display font-700 text-lg">
            {editing.id ? 'Редактировать сотрудника' : 'Новый пользователь'}
          </div>
          <button onClick={onClose}><Icon name="X" size={20} /></button>
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
                  onClick={() => onChangeEditing({ ...editing, avatar: null })}
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
              value={editing.email || ''} onChange={e => onChangeEditing({ ...editing, email: e.target.value })} />
          )}
          <input className="w-full px-3 py-2 border rounded-lg" placeholder="Имя и фамилия"
            value={editing.name || ''} onChange={e => onChangeEditing({ ...editing, name: e.target.value })} />
          <div>
            <input className="w-full px-3 py-2 border rounded-lg" placeholder="Телефон (+7...)"
              value={editing.phone || ''} onChange={e => onChangeEditing({ ...editing, phone: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-brand-blue">★</span>
              Телефон отображается в карточке объекта как контакт представителя собственника
            </p>
          </div>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.role || 'client'}
            onChange={e => onChangeEditing({ ...editing, role: e.target.value as Role })}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <div className="space-y-1">
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm" type="text"
                placeholder={editing.id ? 'Новый пароль (если меняем)' : 'Пароль'}
                value={editing.password || ''} onChange={e => onChangeEditing({ ...editing, password: e.target.value })} />
              <button
                type="button"
                onClick={() => onChangeEditing({ ...editing, password: generatePassword() })}
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
                onChange={e => onChangeEditing({ ...editing, is_active: e.target.checked })} />
              Аккаунт активен
            </label>
          )}
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">Отмена</button>
          <button onClick={onSave} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
