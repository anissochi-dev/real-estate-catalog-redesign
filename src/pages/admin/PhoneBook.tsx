import { useEffect, useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import PhoneCardModal from '@/components/admin/PhoneCardModal';
import ListingInternalCard from './listings/ListingInternalCard';
import { normalizePhone } from '@/lib/phone';
import { fetchPhoneFlags, type PhoneFlag } from '@/hooks/usePhoneFlag';
import { useAuth } from '@/contexts/AuthContext';
import PhoneBookAddModal from './PhoneBookAddModal';
import PhoneBookFlagModal from './PhoneBookFlagModal';
import PhoneBookList from './PhoneBookList';

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

export default function PhoneBook() {
  const { user, token } = useAuth();
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
  const [flags, setFlags] = useState<Record<string, PhoneFlag>>({});
  const [flagPhone, setFlagPhone] = useState<string | null>(null);
  const canManageFlags = user?.role === 'admin' || user?.role === 'director';
  const [trash, setTrash] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const trashRef = useRef(false);
  const tokenRef = useRef<string>(token);

  const load = useCallback((p = 1, q = '') => {
    setLoading(true);
    const inTrash = trashRef.current;
    const promise = q.length >= 2 && !inTrash
      ? adminApi.searchPhones(q)
      : adminApi.listPhones(p, inTrash);
    promise.then(async r => {
      let list: PhoneContact[] = r.contacts || [];
      if (inTrash && q.length >= 2) {
        const ql = q.toLowerCase(); const qd = q.replace(/\D/g, '');
        list = list.filter(c => (qd && c.phone_normalized?.includes(qd)) || (c.name || '').toLowerCase().includes(ql));
      }
      if (typeof r.trash_count === 'number') setTrashCount(r.trash_count);
      setContacts(list);
      setTotal(r.total ?? list.length ?? 0);
      setPages(r.pages ?? 1);
      setPage(r.page ?? 1);
      if (list.length) {
        const phoneNums = list.map(c => c.phone);
        const f = await fetchPhoneFlags(phoneNums);
        setFlags(f);
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { tokenRef.current = token; }, [token]);

  const reloadFlags = async () => {
    if (!contacts.length) return;
    const f = await fetchPhoneFlags(contacts.map(c => c.phone));
    setFlags(f);
  };

  useEffect(() => { trashRef.current = trash; load(1, search); }, [search, load, trash]);

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

  // После добавления нового телефона автоматически синхронизируем с общей базой
  // (связываем номер с объектами и лидами) и обновляем список — без кнопки.
  const handleAdded = async () => {
    setSyncing(true);
    try {
      await adminApi.syncPhones();
    } catch {
      // даже если синхронизация не удалась — список всё равно обновим
    } finally {
      setSyncing(false);
      load(1, search);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">{trash ? 'В корзине' : 'Контактов'}: {total}</div>
          {canManageFlags && (trash || trashCount > 0) && (
            <button onClick={() => setTrash(t => !t)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                trash ? 'bg-red-600 text-white' : 'border border-border text-red-600 hover:bg-red-50'}`}>
              <Icon name={trash ? 'ArrowLeft' : 'Trash2'} size={13} />
              {trash ? 'Вернуться к базе' : `Удалённые (${trashCount})`}
            </button>
          )}
        </div>
        <div className={`flex gap-2 ${trash ? 'hidden' : ''}`}>
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

      <PhoneBookList
        contacts={contacts}
        flags={flags}
        canManageFlags={canManageFlags}
        page={page}
        pages={pages}
        search={search}
        loading={loading}
        onSelect={id => setSelectedId(id)}
        onFlagPhone={phone => setFlagPhone(phone)}
        onLoadPage={p => load(p)}
      />

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
        <PhoneBookAddModal
          onClose={() => setAdding(false)}
          onAdded={handleAdded}
        />
      )}

      {flagPhone && (
        <PhoneBookFlagModal
          phone={flagPhone}
          current={flags[normalizePhone(flagPhone)] || null}
          token={tokenRef.current}
          onClose={() => setFlagPhone(null)}
          onSaved={reloadFlags}
        />
      )}
    </div>
  );
}
