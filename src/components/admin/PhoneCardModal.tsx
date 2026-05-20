import { useEffect, useState } from 'react';
import { adminApi, uploadFile } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

interface PhoneContact {
  id: number;
  phone: string;
  name: string | null;
  company: string | null;
  notes: string | null;
  tags: string | null;
  inn: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  linked_listings?: { id: number; title: string; status: string; role: string; image?: string }[] | null;
  linked_leads?: { id: number; name: string; status: string; created_at: string }[] | null;
}

interface HistoryEntry {
  id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by_name: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'ФИО', company: 'Компания', notes: 'Заметки',
  tags: 'Теги', inn: 'ИНН', phone: 'Телефон', photo_url: 'Фото',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', done: 'Закрыт', rejected: 'Отказ',
};
const LISTING_ROLE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', tenant: 'Арендатор',
};

function fmtDt(s: string) {
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Tab = 'info' | 'links' | 'history';

interface Props {
  contactId: number;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function PhoneCardModal({ contactId, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const [contact, setContact] = useState<PhoneContact | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState<Tab>('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', notes: '', tags: '', inn: '', photo_url: '' });
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const load = () => {
    adminApi.getPhone(contactId).then(r => {
      const c: PhoneContact = r.contact;
      setContact(c);
      setForm({
        name: c.name || '',
        company: c.company || '',
        notes: c.notes || '',
        tags: c.tags || '',
        inn: c.inn || '',
        photo_url: c.photo_url || '',
      });
    });
  };

  const loadHistory = () => {
    adminApi.getPhoneHistory(contactId).then(r => setHistory(r.history || []));
  };

  useEffect(() => {
    load();
    loadHistory();
  }, [contactId]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updatePhone(contactId, form);
      setEditing(false);
      load();
      loadHistory();
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setPhotoUploading(true);
    try {
      const url = await uploadFile(file, 'photos');
      setForm(f => ({ ...f, photo_url: url }));
    } catch (e: unknown) {
      alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setPhotoUploading(false);
    }
  };

  const unlink = async (type: 'listing' | 'lead', id: number) => {
    if (type === 'listing') await adminApi.unlinkPhone(contactId, { listing_id: id });
    else await adminApi.unlinkPhone(contactId, { lead_id: id });
    load();
    onUpdate?.();
  };

  const deleteContact = async () => {
    if (!confirm('Удалить этот номер из базы? Действие необратимо.')) return;
    await adminApi.deletePhone(contactId);
    onUpdate?.();
    onClose();
  };

  if (!contact) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
          <Icon name="Loader2" size={20} className="animate-spin text-brand-blue" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          {contact.photo_url ? (
            <img src={contact.photo_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
              <Icon name="User" size={22} className="text-brand-blue" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-display font-700 text-base">{contact.phone}</div>
            <div className="text-sm text-muted-foreground truncate">
              {[contact.name, contact.company].filter(Boolean).join(' · ') || 'Без имени'}
            </div>
            <div className="text-xs text-muted-foreground">
              Добавлен {fmtDt(contact.created_at)}
            </div>
          </div>
          {user?.role && ['admin', 'director'].includes(user.role) && (
            <button onClick={deleteContact} title="Удалить из базы"
              className="p-2 rounded-lg hover:bg-red-50 text-red-500 shrink-0">
              <Icon name="Trash2" size={16} />
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {([['info', 'Карточка', 'User'], ['links', 'Связи', 'Link'], ['history', 'История', 'Clock']] as [Tab, string, string][]).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                tab === id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* === INFO TAB === */}
          {tab === 'info' && (
            <div className="p-5 space-y-4">
              {editing ? (
                <div className="space-y-3">
                  {/* Photo upload */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Фото</label>
                    <div className="flex items-center gap-3">
                      {form.photo_url && (
                        <img src={form.photo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-border" />
                      )}
                      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-sm hover:border-brand-blue transition">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                        />
                        {photoUploading
                          ? <><Icon name="Loader2" size={14} className="animate-spin" /> Загрузка...</>
                          : <><Icon name="Upload" size={14} /> {form.photo_url ? 'Заменить фото' : 'Загрузить фото'}</>
                        }
                      </label>
                      {form.photo_url && (
                        <button type="button" onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                          className="text-red-500 hover:text-red-700 text-xs">Удалить</button>
                      )}
                    </div>
                  </div>

                  {[['name', 'ФИО'], ['company', 'Компания'], ['inn', 'ИНН'], ['tags', 'Теги']].map(([k, l]) => (
                    <div key={k}>
                      <label className="text-xs font-semibold text-muted-foreground mb-1 block">{l}</label>
                      <input
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                        value={(form as Record<string, string>)[k]}
                        onChange={e => setForm({ ...form, [k]: e.target.value })}
                        placeholder={l}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Заметки</label>
                    <textarea
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none"
                      rows={3}
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={save} disabled={saving}
                      className="btn-blue text-white px-4 py-2 rounded-lg text-sm font-semibold">
                      {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button onClick={() => setEditing(false)}
                      className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted">
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {contact.name && (
                      <div><span className="text-xs text-muted-foreground block">ФИО</span>{contact.name}</div>
                    )}
                    {contact.company && (
                      <div><span className="text-xs text-muted-foreground block">Компания</span>{contact.company}</div>
                    )}
                    {contact.inn && (
                      <div><span className="text-xs text-muted-foreground block">ИНН</span>{contact.inn}</div>
                    )}
                    {contact.tags && (
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground block mb-1">Теги</span>
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                            <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {contact.notes && (
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground block">Заметки</span>
                        <div className="text-sm whitespace-pre-wrap">{contact.notes}</div>
                      </div>
                    )}
                  </div>
                  {!contact.name && !contact.company && !contact.inn && !contact.notes && (
                    <div className="text-sm text-muted-foreground">Информация не заполнена</div>
                  )}
                  <button onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 text-brand-blue text-sm font-semibold hover:underline mt-2">
                    <Icon name="Pencil" size={13} /> Редактировать
                  </button>
                </div>
              )}
            </div>
          )}

          {/* === LINKS TAB === */}
          {tab === 'links' && (
            <div className="p-5 space-y-5">
              <div>
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Icon name="Building2" size={15} />
                  Объекты ({contact.linked_listings?.length || 0})
                </div>
                {contact.linked_listings && contact.linked_listings.length > 0 ? (
                  <div className="space-y-2">
                    {contact.linked_listings.map(l => (
                      <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                        {l.image && <img src={l.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{l.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {LISTING_ROLE_LABELS[l.role] || l.role} · {l.status === 'active' ? 'Активен' : 'Архив'}
                          </div>
                        </div>
                        <button onClick={() => unlink('listing', l.id)}
                          className="text-red-500 hover:text-red-700 p-1 shrink-0" title="Отвязать">
                          <Icon name="Unlink" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Не привязан к объектам</div>
                )}
              </div>

              <div>
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Icon name="Inbox" size={15} />
                  Лиды ({contact.linked_leads?.length || 0})
                </div>
                {contact.linked_leads && contact.linked_leads.length > 0 ? (
                  <div className="space-y-2">
                    {contact.linked_leads.map(l => (
                      <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{l.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {LEAD_STATUS_LABELS[l.status] || l.status} · {fmtDt(l.created_at)}
                          </div>
                        </div>
                        <button onClick={() => unlink('lead', l.id)}
                          className="text-red-500 hover:text-red-700 p-1 shrink-0" title="Отвязать">
                          <Icon name="Unlink" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Нет привязанных лидов</div>
                )}
              </div>
            </div>
          )}

          {/* === HISTORY TAB === */}
          {tab === 'history' && (
            <div className="p-5">
              {history.length === 0 ? (
                <div className="text-sm text-muted-foreground">История изменений пуста</div>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="p-3 rounded-xl border border-border bg-white">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-brand-blue">
                          {FIELD_LABELS[h.field_name] || h.field_name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {fmtDt(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Было</div>
                          <div className={`px-2 py-1 rounded bg-red-50 text-red-800 line-through opacity-80 break-words ${
                            h.field_name === 'photo_url' ? 'italic' : ''
                          }`}>
                            {h.field_name === 'photo_url'
                              ? (h.old_value ? 'фото' : '—')
                              : (h.old_value || '—')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">Стало</div>
                          <div className={`px-2 py-1 rounded bg-emerald-50 text-emerald-800 break-words ${
                            h.field_name === 'photo_url' ? 'italic' : ''
                          }`}>
                            {h.field_name === 'photo_url'
                              ? (h.new_value ? 'фото' : '—')
                              : (h.new_value || '—')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}