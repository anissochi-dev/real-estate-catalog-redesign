import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import PhoneCardModal from '@/components/admin/PhoneCardModal';
import ListingInternalCard from './listings/ListingInternalCard';
import { formatPhone, normalizePhone, extractDigits } from '@/lib/phone';

interface PhoneContact {
  id: number;
  phone: string;
  phone_normalized: string;
  name: string | null;
  company: string | null;
  notes: string | null;
  tags: string | null;
  inn: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  listings_count?: number;
  leads_count?: number;
  linked_listings?: { id: number; title: string; status: string; role: string; image?: string }[] | null;
  linked_leads?: { id: number; name: string; status: string; created_at: string }[] | null;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function AddContactModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ phone: '', name: '', company: '', notes: '' });
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractDigits(e.target.value).slice(0, 10);
    const normalized = digits ? '+7' + digits : '';
    setPhoneDisplay(digits ? formatPhone(normalized) : '');
    setForm(f => ({ ...f, phone: normalized }));
  };

  const save = async () => {
    if (!form.phone.trim()) { setErr('Введите номер телефона'); return; }
    setSaving(true);
    setErr('');
    try {
      await adminApi.createPhone({ ...form, phone: normalizePhone(form.phone) });
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

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Телефон *</label>
          <input
            type="tel"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono tracking-wide"
            placeholder="+7 900 000-00-00"
            value={phoneDisplay}
            onChange={handlePhoneChange}
            autoComplete="off"
          />
          <div className="mt-1 text-[11px] text-muted-foreground">Пример: <span className="font-mono">+7 900 123-45-67</span></div>
        </div>

        {[['name', 'Имя'], ['company', 'Компания']].map(([k, l]) => (
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [openListingId, setOpenListingId] = useState<number | null>(null);

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
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Имя / Компания</th>
                <th className="px-4 py-3 hidden sm:table-cell">ИНН</th>
                <th className="px-4 py-3 text-center">Объекты</th>
                <th className="px-4 py-3 text-center">Лиды</th>
                <th className="px-4 py-3 hidden md:table-cell">Добавлен</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer">
                  <td className="px-3 py-2">
                    {c.photo_url
                      ? <img src={c.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <Icon name="User" size={14} className="text-muted-foreground" />
                        </div>
                    }
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-brand-blue">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3">
                    {c.name && <div>{c.name}</div>}
                    {c.company && <div className="text-xs text-muted-foreground">{c.company}</div>}
                    {!c.name && !c.company && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {c.inn || '—'}
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
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{fmtDate(c.created_at)}</td>
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

      {selectedId !== null && (
        <PhoneCardModal
          contactId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={() => load(page, search)}
          onOpenListing={id => { setSelectedId(null); setOpenListingId(id); }}
          onOpenLead={() => { setSelectedId(null); }}
        />
      )}

      {openListingId !== null && (
        <ListingInternalCard
          listingId={openListingId}
          onClose={() => setOpenListingId(null)}
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