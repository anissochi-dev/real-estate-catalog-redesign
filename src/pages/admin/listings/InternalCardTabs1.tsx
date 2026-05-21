import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Listing, fmtDate, CONDITIONS, PARKING, ENTRANCE, FINISHING, ROAD_LINES } from './types';
import { HistoryRow, StatData, InternalCardLead, DbComment, LEAD_STATUS, fmt } from './internalCardTypes';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon name="Loader2" size={24} className="animate-spin text-brand-blue" />
    </div>
  );
}

function translate(value: string | null | undefined, map: string[][]): string {
  if (!value) return '—';
  const found = map.find(([key]) => key === value);
  return found ? found[1] : value;
}

export function TabOverview({ listing, siteUrl }: { listing: Listing; siteUrl?: string }) {
  const conditionLabel = translate(listing.condition, CONDITIONS);
  const parkingLabel = translate(listing.parking, PARKING);
  const entranceLabel = translate(listing.entrance, ENTRANCE);
  const finishingLabel = translate(listing.finishing ?? null, FINISHING);
  const roadLineLabel = translate(listing.road_line ?? null, ROAD_LINES);

  const rows = [
    { label: 'Цена', value: `${fmt(listing.price)} ₽` },
    { label: 'Площадь', value: `${listing.area} м²` },
    { label: 'Цена за м²', value: listing.area ? `${fmt(Math.round(listing.price / listing.area))} ₽/м²` : '—' },
    { label: 'Адрес', value: listing.address || '—' },
    { label: 'Район', value: listing.district || '—' },
    { label: 'Собственник', value: listing.owner_name || '—' },
    { label: 'Телефон', value: listing.owner_phone || '—' },
    { label: 'Состояние', value: conditionLabel },
    { label: 'Отделка', value: finishingLabel },
    { label: 'Этаж', value: listing.floor != null ? `${listing.floor} из ${listing.total_floors ?? '?'}` : '—' },
    { label: 'Парковка', value: parkingLabel },
    { label: 'Вход', value: entranceLabel },
    { label: 'Линия', value: roadLineLabel },
    listing.ceiling_height ? { label: 'Высота потолков', value: `${listing.ceiling_height} м` } : null,
    listing.electricity_kw ? { label: 'Электричество', value: `${listing.electricity_kw} кВт` } : null,
    listing.monthly_rent ? { label: 'Арендная плата/мес', value: `${fmt(listing.monthly_rent)} ₽` } : null,
    listing.yearly_rent ? { label: 'Арендная плата/год', value: `${fmt(listing.yearly_rent)} ₽` } : null,
    listing.payback ? { label: 'Окупаемость', value: `${listing.payback} лет` } : null,
    listing.profit ? { label: 'Прибыль', value: `${fmt(listing.profit)} ₽/мес` } : null,
    listing.tenant_name ? { label: 'Арендатор', value: listing.tenant_name } : null,
    listing.utilities ? { label: 'Коммунальные услуги', value: listing.utilities } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const siteSlug = listing.slug;
  const siteLink = siteUrl && siteSlug ? `${siteUrl.replace(/\/$/, '')}/object/${siteSlug}` : null;

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(r => (
          <div key={r.label} className="bg-muted/40 rounded-xl px-4 py-3">
            <div className="text-xs text-muted-foreground mb-0.5">{r.label}</div>
            <div className="text-sm font-semibold">{r.value}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Площадки размещения</div>
        <div className="flex flex-wrap gap-2">
          {listing.export_avito && <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold">Авито</span>}
          {listing.export_yandex && <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Яндекс.Недвижимость</span>}
          {listing.export_cian && <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">ЦИАН</span>}
          {siteLink && (
            <a href={siteLink} target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1 rounded-full bg-brand-blue/10 text-brand-blue font-semibold hover:bg-brand-blue/20 flex items-center gap-1">
              Наш сайт <Icon name="ExternalLink" size={11} />
            </a>
          )}
          {!listing.export_avito && !listing.export_yandex && !listing.export_cian && !siteLink && (
            <span className="text-sm text-muted-foreground">Нигде не размещено</span>
          )}
        </div>
      </div>

      {listing.description && (
        <div>
          <div className="text-sm font-semibold mb-1">Описание</div>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{listing.description}</div>
        </div>
      )}
    </div>
  );
}

export function TabPriceHistory({ listingId }: { listingId: number }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getListingHistory(listingId).then(r => {
      const all: HistoryRow[] = r.history || [];
      setRows(all.filter(h => h.changes && h.changes.price));
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  if (!rows.length) return (
    <div className="p-6 text-center text-muted-foreground text-sm">История изменений цены не найдена</div>
  );

  return (
    <div className="p-6">
      <div className="text-sm font-semibold mb-3">История изменений цены</div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Дата</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Была</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Стала</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Кто изменил</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => {
              const [oldP, newP] = h.changes!.price as [number, number];
              const diff = Number(newP) - Number(oldP);
              return (
                <tr key={h.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(h.created_at)}</td>
                  <td className="px-4 py-2 font-mono">{fmt(Number(oldP))} ₽</td>
                  <td className="px-4 py-2 font-mono font-semibold">
                    {fmt(Number(newP))} ₽
                    <span className={`ml-2 text-xs ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{h.user_name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TabStats({ listingId, listing }: { listingId: number; listing: Listing }) {
  const [stats, setStats] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getListingStats(listingId).then(r => {
      setStats(r.stats || r || {});
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  const cards = [
    { label: 'Просмотров', value: stats?.total_views ?? 0, icon: 'Eye', color: 'from-brand-blue to-indigo-600' },
    { label: 'Звонков', value: stats?.total_calls ?? 0, icon: 'Phone', color: 'from-emerald-500 to-emerald-700' },
    { label: 'Заявок', value: stats?.total_leads ?? 0, icon: 'Inbox', color: 'from-brand-orange to-orange-600' },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl p-4 bg-gradient-to-br ${c.color} text-white`}>
            <Icon name={c.icon} size={20} className="mb-2 opacity-80" />
            <div className="text-2xl font-display font-700">{c.value}</div>
            <div className="text-xs opacity-90">{c.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Площадки</div>
        <div className="space-y-2">
          {[
            { key: 'export_avito', label: 'Авито', color: 'text-green-700 bg-green-50 border-green-200' },
            { key: 'export_yandex', label: 'Яндекс.Недвижимость', color: 'text-red-700 bg-red-50 border-red-200' },
            { key: 'export_cian', label: 'ЦИАН', color: 'text-blue-700 bg-blue-50 border-blue-200' },
          ].map(p => (
            <div key={p.key} className={`flex items-center justify-between px-4 py-2 rounded-xl border text-sm ${
              (listing as Record<string, unknown>)[p.key] ? p.color : 'bg-muted/30 border-border text-muted-foreground'
            }`}>
              <span className="font-medium">{p.label}</span>
              <span className="text-xs">
                {(listing as Record<string, unknown>)[p.key] ? 'Размещён' : 'Не размещён'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TabLeads({ listingId }: { listingId: number }) {
  const [leads, setLeads] = useState<InternalCardLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listLeads().then(r => {
      const all: InternalCardLead[] = r.leads || [];
      setLeads(all.filter(l => l.listing_id === listingId));
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  if (!leads.length) return (
    <div className="p-6 text-center text-muted-foreground text-sm">По этому объекту заявок нет</div>
  );

  return (
    <div className="p-6">
      <div className="text-sm font-semibold mb-3">Заявки по объекту ({leads.length})</div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Дата</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Имя</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Телефон</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Статус</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(l.created_at)}</td>
                <td className="px-4 py-2">{l.name}</td>
                <td className="px-4 py-2 font-mono text-brand-blue">{l.phone}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">
                    {LEAD_STATUS[l.status] || l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TabComments({ listingId }: { listingId: number }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<DbComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canView = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);
  const canAdd = canView;

  const load = () => {
    adminApi.getListingComments(listingId).then(r => {
      const all: DbComment[] = r.comments || [];
      if (user?.role === 'broker') {
        setComments(all.filter(c => !c.is_ai && (c.user_id === user.id)));
      } else {
        setComments(all.filter(c => !c.is_ai));
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [listingId]);

  if (!canView) return (
    <div className="p-6 text-center text-muted-foreground text-sm">Нет доступа к заметкам</div>
  );

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await adminApi.addListingComment(listingId, text.trim(), false);
      setText('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить заметку?')) return;
    setDeletingId(id);
    try {
      await adminApi.deleteListingComment(id);
      load();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="MessageSquare" size={15} className="text-brand-blue" />
        <span className="text-sm font-semibold">Личные заметки по объекту</span>
      </div>
      <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
        Заметки видны только вам, администратору и директору. Используйте для личных наблюдений о клиентах, переговорах, договорённостях.
      </div>

      {loading ? <Spinner /> : comments.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          <Icon name="MessageSquarePlus" size={28} className="mx-auto mb-2 opacity-30" />
          Заметок пока нет
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-muted/40 rounded-xl px-4 py-3 group relative">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-brand-blue/20 flex items-center justify-center text-xs font-bold text-brand-blue shrink-0">
                    {(c.user_name || 'Б').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold">{c.user_name}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</span>
                </div>
                {(user?.role === 'admin' || user?.role === 'director' || c.user_id === user?.id) && (
                  <button
                    onClick={() => del(c.id)}
                    disabled={deletingId === c.id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all shrink-0"
                  >
                    {deletingId === c.id
                      ? <Icon name="Loader2" size={13} className="animate-spin" />
                      : <Icon name="Trash2" size={13} />}
                  </button>
                )}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap pl-8">{c.comment}</div>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="space-y-2">
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) save(); }}
            rows={3}
            placeholder="Напишите заметку... (Ctrl+Enter для сохранения)"
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
          <button
            onClick={save}
            disabled={!text.trim() || saving}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
            Сохранить заметку
          </button>
        </div>
      )}
    </div>
  );
}
