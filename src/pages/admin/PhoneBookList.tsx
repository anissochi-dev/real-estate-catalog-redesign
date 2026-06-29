import Icon from '@/components/ui/icon';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { type PhoneFlag } from '@/hooks/usePhoneFlag';
import PhoneFlagBadge from '@/components/PhoneFlagBadge';

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

interface Props {
  contacts: PhoneContact[];
  flags: Record<string, PhoneFlag>;
  canManageFlags: boolean;
  page: number;
  pages: number;
  search: string;
  loading: boolean;
  onSelect: (id: number) => void;
  onFlagPhone: (phone: string) => void;
  onLoadPage: (p: number) => void;
}

export default function PhoneBookList({
  contacts, flags, canManageFlags, page, pages, search, loading,
  onSelect, onFlagPhone, onLoadPage,
}: Props) {
  if (loading) {
    return <div className="text-center text-muted-foreground py-10">Загрузка...</div>;
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        {search ? 'Ничего не найдено' : 'Телефонная база пуста. Нажмите «Синхронизировать» для автозаполнения.'}
      </div>
    );
  }

  return (
    <>
      {/* Мобильный вид */}
      <div className="sm:hidden bg-white rounded-2xl shadow-sm divide-y divide-border">
        {contacts.map(c => {
          const nPhone = normalizePhone(c.phone);
          const flag = flags[nPhone] || null;
          return (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3">
              <div className="shrink-0" onClick={() => onSelect(c.id)}>
                {c.photo_url
                  ? <img src={c.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Icon name="User" size={16} className="text-muted-foreground" />
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(c.id)}>
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
                <button onClick={() => onFlagPhone(c.phone)}
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
                  onClick={() => onSelect(c.id)}
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
                          onClick={() => onFlagPhone(c.phone)}
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

      {/* Пагинация */}
      {pages > 1 && !search && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => onLoadPage(page - 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-40">
            <Icon name="ChevronLeft" size={16} />
          </button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => onLoadPage(page + 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-40">
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      )}
    </>
  );
}
