import { useEffect, useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import PhoneCardModal from '@/components/admin/PhoneCardModal';
import ListingInternalCard from './listings/ListingInternalCard';
import { formatPhone, normalizePhone, extractDigits } from '@/lib/phone';
import { fetchPhoneFlags, setPhoneFlag, removePhoneFlag, type PhoneFlag, type FlagType } from '@/hooks/usePhoneFlag';
import PhoneFlagBadge from '@/components/PhoneFlagBadge';
import { useAuth } from '@/contexts/AuthContext';

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
  const [existingId, setExistingId] = useState<number | null>(null);
  const [lookupTimer, setLookupTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractDigits(e.target.value).slice(0, 10);
    const normalized = digits ? '+7' + digits : '';
    setPhoneDisplay(digits ? formatPhone(normalized) : '');
    setForm(f => ({ ...f, phone: normalized }));
    setErr('');
    setExistingId(null);

    if (lookupTimer) clearTimeout(lookupTimer);
    if (digits.length === 10) {
      setLookingUp(true);
      const t = setTimeout(async () => {
        try {
          const res = await adminApi.searchPhones(normalized);
          const exact = (res.contacts || []).find(
            (c: { phone: string }) => extractDigits(c.phone) === digits
          );
          if (exact) {
            setExistingId(exact.id);
            setForm(f => ({
              ...f,
              name: f.name || exact.name || '',
              company: f.company || exact.company || '',
              notes: f.notes || exact.notes || '',
            }));
          }
        } catch { /* ignore */ }
        finally { setLookingUp(false); }
      }, 350);
      setLookupTimer(t);
    } else {
      setLookingUp(false);
    }
  };

  const save = async () => {
    const digits = extractDigits(form.phone);
    if (!form.phone.trim() || digits.length === 0) { setErr('Введите номер телефона'); return; }
    if (digits.length < 10) { setErr('Номер телефона введён не полностью — должно быть 10 цифр'); return; }
    setSaving(true);
    setErr('');
    try {
      const normalized = normalizePhone(form.phone);
      if (existingId) {
        await adminApi.updatePhone(existingId, { name: form.name, company: form.company, notes: form.notes });
      } else {
        await adminApi.createPhone({ ...form, phone: normalized });
      }
      onAdded();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const isComplete = extractDigits(form.phone).length === 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="font-display font-700 text-base">
            {existingId ? 'Дополнить контакт' : 'Новый контакт'}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><Icon name="X" size={18} /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Телефон *</label>
          <div className="relative">
            <input
              type="tel"
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono tracking-wide pr-8 ${
                existingId ? 'border-brand-blue bg-brand-blue/5' : 'border-border'
              }`}
              placeholder="+7 900 000-00-00"
              value={phoneDisplay}
              onChange={handlePhoneChange}
              autoComplete="off"
            />
            {lookingUp && (
              <Icon name="Loader2" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            )}
            {!lookingUp && isComplete && existingId && (
              <Icon name="UserCheck" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-blue" />
            )}
            {!lookingUp && isComplete && !existingId && (
              <Icon name="UserPlus" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />
            )}
          </div>
          {existingId ? (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-brand-blue">
              <Icon name="Info" size={11} />
              Контакт найден в базе — данные будут дополнены
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-muted-foreground">Пример: <span className="font-mono">+7 900 123-45-67</span></div>
          )}
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
        {err && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <Icon name="AlertCircle" size={14} className="shrink-0" />
            {err}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            {saving ? 'Сохранение...' : existingId ? 'Дополнить' : 'Добавить'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

const FLAG_LABELS: Record<FlagType, string> = {
  bad_owner: 'Плохой собственник',
  competitor: 'Брокер-конкурент',
};

function FlagModal({ phone, current, token, onClose, onSaved }: {
  phone: string; current: PhoneFlag | null; token: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<FlagType>(current?.flag_type || 'bad_owner');
  const [comment, setComment] = useState(current?.comment || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setPhoneFlag(phone, type, comment, token);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await removePhoneFlag(phone, token);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-display font-700 text-base">Отметить номер</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={18} /></button>
        </div>
        <div className="font-mono text-brand-blue font-semibold">{formatPhone(phone)}</div>
        <div className="space-y-2">
          {(['bad_owner', 'competitor'] as FlagType[]).map(ft => (
            <button key={ft} onClick={() => setType(ft)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition text-sm font-medium flex items-center gap-2 ${type === ft ? (ft === 'bad_owner' ? 'border-red-400 bg-red-50 text-red-700' : 'border-orange-400 bg-orange-50 text-orange-700') : 'border-border hover:bg-muted/50'}`}>
              <span className={`w-3 h-3 rounded-full shrink-0 ${ft === 'bad_owner' ? 'bg-red-500' : 'bg-orange-400'}`} />
              {FLAG_LABELS[ft]}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Комментарий</label>
          <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
            placeholder="Коротко — почему отмечаете этот номер"
            value={comment} onChange={e => setComment(e.target.value.slice(0, 300))} />
          <div className="text-right text-[11px] text-muted-foreground">{comment.length}/300</div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold flex-1">
            {saving ? 'Сохранение...' : current ? 'Обновить' : 'Отметить'}
          </button>
          {current && (
            <button onClick={remove} disabled={saving}
              className="px-4 py-2 rounded-xl text-sm border border-red-200 text-red-600 hover:bg-red-50">
              Снять
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">Отмена</button>
        </div>
      </div>
    </div>
  );
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
  const tokenRef = useRef<string>(token);

  const load = useCallback((p = 1, q = '') => {
    setLoading(true);
    const promise = q.length >= 2
      ? adminApi.searchPhones(q)
      : adminApi.listPhones(p);
    promise.then(async r => {
      const list: PhoneContact[] = r.contacts || [];
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
        <>
        {/* Мобильный вид */}
        <div className="sm:hidden bg-white rounded-2xl shadow-sm divide-y divide-border">
          {contacts.map(c => {
            const nPhone = normalizePhone(c.phone);
            const flag = flags[nPhone] || null;
            return (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3">
              <div className="shrink-0" onClick={() => setSelectedId(c.id)}>
                {c.photo_url
                  ? <img src={c.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Icon name="User" size={16} className="text-muted-foreground" />
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedId(c.id)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono font-semibold text-brand-blue text-sm">{formatPhone(c.phone)}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(c.listings_count || 0) > 0 && (
                      <span className="bg-brand-blue/10 text-brand-blue text-xs font-semibold px-2 py-0.5 rounded-full">{c.listings_count} obj</span>
                    )}
                    {(c.leads_count || 0) > 0 && (
                      <span className="bg-brand-orange/10 text-brand-orange text-xs font-semibold px-2 py-0.5 rounded-full">{c.leads_count} лид</span>
                    )}
                  </div>
                </div>
                {(c.name || c.company) && (
                  <div className="text-sm mt-0.5">
                    {c.name && <span className="font-medium">{c.name}</span>}
                    {c.company && <span className="text-xs text-muted-foreground ml-1">{c.company}</span>}
                  </div>
                )}
                {flag && <div className="mt-1"><PhoneFlagBadge flag={flag} size="sm" /></div>}
                <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(c.created_at)}</div>
              </div>
              {canManageFlags && (
                <button onClick={() => setFlagPhone(c.phone)}
                  title={flag ? 'Изменить метку' : 'Отметить'}
                  className={`shrink-0 p-2 rounded-lg border transition ${flag ? 'border-transparent text-muted-foreground' : 'border-dashed border-border text-muted-foreground/40 hover:border-red-300 hover:text-red-500'}`}>
                  <Icon name={flag ? 'Pencil' : 'Flag'} size={14} />
                </button>
              )}
            </div>
            );
          })}
        </div>

        {/* Десктопный вид */}
        <div className="hidden sm:block bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Имя / Компания</th>
                <th className="px-4 py-3 hidden sm:table-cell">ИНН</th>
                <th className="px-4 py-3 text-center">Объекты</th>
                <th className="px-4 py-3 text-center">Лиды</th>
                <th className="px-4 py-3 hidden md:table-cell">Метка</th>
                <th className="px-4 py-3 hidden md:table-cell">Добавлен</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => {
                const nPhone = normalizePhone(c.phone);
                const flag = flags[nPhone] || null;
                return (
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
                  <td className="px-4 py-3 hidden md:table-cell" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {flag && <PhoneFlagBadge flag={flag} size="sm" />}
                      {canManageFlags && (
                        <button
                          onClick={() => setFlagPhone(c.phone)}
                          title={flag ? 'Изменить метку' : 'Отметить номер'}
                          className={`p-1 rounded-lg border transition ${flag ? 'border-transparent text-muted-foreground hover:bg-muted' : 'border-dashed border-border text-muted-foreground/50 hover:border-red-300 hover:text-red-500'}`}
                        >
                          <Icon name={flag ? 'Pencil' : 'Flag'} size={13} />
                        </button>
                      )}
                      {!flag && !canManageFlags && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{fmtDate(c.created_at)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
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
          onAdded={handleAdded}
        />
      )}

      {flagPhone && (
        <FlagModal
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