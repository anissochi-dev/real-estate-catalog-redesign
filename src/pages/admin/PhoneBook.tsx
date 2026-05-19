import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface PhoneContact {
  id: number;
  phone: string;
  phone_normalized: string;
  name: string | null;
  company: string | null;
  notes: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  listings_count?: number;
  leads_count?: number;
  linked_listings?: { id: number; title: string; status: string; role: string; image?: string }[] | null;
  linked_leads?: { id: number; name: string; status: string; created_at: string }[] | null;
}

interface DetailPanelProps {
  contact: PhoneContact;
  onClose: () => void;
  onUpdate: () => void;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', done: 'Закрыт', rejected: 'Отказ',
};
const LISTING_ROLE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', tenant: 'Арендатор',
};

function DetailPanel({ contact, onClose, onUpdate }: DetailPanelProps) {
  const [full, setFull] = useState<PhoneContact | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: contact.name || '', company: contact.company || '', notes: contact.notes || '', tags: contact.tags || '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getPhone(contact.id).then(r => setFull(r.contact));
  }, [contact.id]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updatePhone(contact.id, form);
      setEditing(false);
      onUpdate();
      adminApi.getPhone(contact.id).then(r => setFull(r.contact));
    } finally {
      setSaving(false);
    }
  };

  const unlink = async (type: 'listing' | 'lead', id: number) => {
    if (type === 'listing') await adminApi.unlinkPhone(contact.id, { listing_id: id });
    else await adminApi.unlinkPhone(contact.id, { lead_id: id });
    adminApi.getPhone(contact.id).then(r => setFull(r.contact));
    onUpdate();
  };

  const data = full || contact;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="font-display font-700 text-base">{data.phone}</div>
            {data.name && <div className="text-sm text-muted-foreground">{data.name}</div>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted ml-2">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {editing ? (
            <div className="space-y-3">
              {[['name', 'Имя'], ['company', 'Компания'], ['tags', 'Теги']].map(([k, l]) => (
                <div key={k}>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">{l}</label>
                  <input
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    value={(form as Record<string, string>)[k]}
                    onChange={e => setForm({ ...form, [k]: e.target.value })}
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
            <div className="space-y-1 text-sm">
              {data.name && <div><span className="text-muted-foreground">Имя:</span> {data.name}</div>}
              {data.company && <div><span className="text-muted-foreground">Компания:</span> {data.company}</div>}
              {data.tags && <div><span className="text-muted-foreground">Теги:</span> {data.tags}</div>}
              {data.notes && <div><span className="text-muted-foreground">Заметки:</span> {data.notes}</div>}
              <div className="text-xs text-muted-foreground">Добавлен {fmtDate(data.created_at)}</div>
              <button onClick={() => setEditing(true)}
                className="text-brand-blue text-xs font-semibold hover:underline mt-1">
                Редактировать
              </button>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Icon name="Building2" size={15} />
              Объекты ({data.linked_listings?.length || 0})
            </div>
            {data.linked_listings && data.linked_listings.length > 0 ? (
              <div className="space-y-2">
                {data.linked_listings.map(l => (
                  <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                    {l.image && <img src={l.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {LISTING_ROLE_LABELS[l.role] || l.role} · {l.status === 'active' ? 'Активен' : 'Архив'}
                      </div>
                    </div>
                    <button onClick={() => unlink('listing', l.id)}
                      className="text-red-500 hover:text-red-700 p-1 flex-shrink-0">
                      <Icon name="Unlink" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Не привязан ни к одному объекту</div>
            )}
          </div>

          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Icon name="Inbox" size={15} />
              Лиды ({data.linked_leads?.length || 0})
            </div>
            {data.linked_leads && data.linked_leads.length > 0 ? (
              <div className="space-y-2">
                {data.linked_leads.map(l => (
                  <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {LEAD_STATUS_LABELS[l.status] || l.status} · {fmtDate(l.created_at)}
                      </div>
                    </div>
                    <button onClick={() => unlink('lead', l.id)}
                      className="text-red-500 hover:text-red-700 p-1 flex-shrink-0">
                      <Icon name="Unlink" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Нет привязанных лидов</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddContactModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ phone: '', name: '', company: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.phone.trim()) { setErr('Введите номер телефона'); return; }
    setSaving(true);
    setErr('');
    try {
      await adminApi.createPhone(form);
      onAdded();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="font-display font-700 text-base">Новый контакт</div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><Icon name="X" size={18} /></button>
        </div>
        {[['phone', 'Телефон *'], ['name', 'Имя'], ['company', 'Компания']].map(([k, l]) => (
          <div key={k}>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{l}</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as Record<string, string>)[k]}
              onChange={e => setForm({ ...form, [k]: e.target.value })}
            />
          </div>
        ))}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Заметки</label>
          <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
            value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            {saving ? 'Добавление...' : 'Добавить'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PhoneBook() {
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<PhoneContact | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback((p = 1, q = '') => {
    setLoading(true);
    const promise = q.length >= 2
      ? adminApi.searchPhones(q)
      : adminApi.listPhones(p);
    promise.then(r => {
      setContacts(r.contacts || []);
      setTotal(r.total ?? r.contacts?.length ?? 0);
      setPages(r.pages ?? 1);
      setPage(r.page ?? 1);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1, search); }, [search, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await adminApi.syncPhones();
      alert(`Синхронизация завершена. Добавлено новых: ${r.synced}`);
      load(page, search);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">Контактов: {total}</div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
            <Icon name="RefreshCw" size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Синхронизация...' : 'Синхронизировать'}
          </button>
          <button onClick={() => setAdding(true)}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Icon name="Plus" size={16} /> Добавить
          </button>
        </div>
      </div>

      <div className="relative">
        <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm"
          placeholder="Поиск по номеру или имени..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10">Загрузка...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center text-muted-foreground py-10">
          {search ? 'Ничего не найдено' : 'Телефонная база пуста. Нажмите «Синхронизировать» для автозаполнения.'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Имя / Компания</th>
                <th className="px-4 py-3 text-center">Объекты</th>
                <th className="px-4 py-3 text-center">Лиды</th>
                <th className="px-4 py-3">Добавлен</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}
                  onClick={() => setSelected(c)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer">
                  <td className="px-4 py-3 font-mono font-semibold text-brand-blue">{c.phone}</td>
                  <td className="px-4 py-3">
                    {c.name && <div>{c.name}</div>}
                    {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
                    {!c.name && !c.company && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(c.listings_count || 0) > 0
                      ? <span className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded-full">{c.listings_count}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(c.leads_count || 0) > 0
                      ? <span className="bg-brand-orange/10 text-brand-orange text-xs font-semibold px-2 py-0.5 rounded-full">{c.leads_count}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && !search && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => load(page - 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-40">
            <Icon name="ChevronLeft" size={16} />
          </button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-40">
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      )}

      {selected && (
        <DetailPanel
          contact={selected}
          onClose={() => setSelected(null)}
          onUpdate={() => load(page, search)}
        />
      )}

      {adding && (
        <AddContactModal
          onClose={() => setAdding(false)}
          onAdded={() => load(1, search)}
        />
      )}
    </div>
  );
}
