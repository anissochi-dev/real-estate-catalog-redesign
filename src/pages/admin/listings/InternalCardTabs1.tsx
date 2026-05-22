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

function translate(value: string | null | undefined, map: readonly (readonly string[])[]): string {
  if (!value) return '—';
  const found = map.find(([key]) => key === value);
  return found ? found[1] : value;
}

function OverviewStatsHeader({ listingId }: { listingId: number }) {
  const [s, setS] = useState<StatData | null>(null);
  useEffect(() => {
    adminApi.getListingStats(listingId).then(r => setS(r)).catch(() => setS(null));
  }, [listingId]);
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-gradient-to-br from-brand-blue to-indigo-600 text-white rounded-xl p-3">
        <div className="flex items-center gap-1.5 text-xs opacity-90"><Icon name="Eye" size={12} /> Просмотры</div>
        <div className="font-display font-700 text-xl mt-1">{fmt(s?.total_views ?? 0)}</div>
      </div>
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-xl p-3">
        <div className="flex items-center gap-1.5 text-xs opacity-90"><Icon name="Phone" size={12} /> Звонки</div>
        <div className="font-display font-700 text-xl mt-1">{fmt(s?.total_calls ?? 0)}</div>
      </div>
      <div className="bg-gradient-to-br from-brand-orange to-orange-600 text-white rounded-xl p-3">
        <div className="flex items-center gap-1.5 text-xs opacity-90"><Icon name="Inbox" size={12} /> Заявки</div>
        <div className="font-display font-700 text-xl mt-1">{fmt(s?.total_leads ?? 0)}</div>
      </div>
    </div>
  );
}

interface OverviewRow { label: string; value: string; icon?: string }
function OverviewBlock({ title, icon, rows }: { title: string; icon: string; rows: OverviewRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <Icon name={icon} size={14} className="text-brand-blue" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              {r.icon && <Icon name={r.icon} size={12} />}
              {r.label}
            </span>
            <span className="font-medium text-right">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabOverview({ listing, siteUrl }: { listing: Listing; siteUrl?: string }) {
  const conditionLabel = translate(listing.condition, CONDITIONS);
  const parkingLabel = translate(listing.parking, PARKING);
  const entranceLabel = translate(listing.entrance, ENTRANCE);
  const finishingLabel = translate(listing.finishing ?? null, FINISHING);
  const roadLineLabel = translate(listing.road_line ?? null, ROAD_LINES);

  // Главные показатели — крупный заголовок
  const headline: OverviewRow[] = [
    { label: 'Цена', value: `${fmt(listing.price)} ₽`, icon: 'Banknote' },
    { label: 'Площадь', value: `${listing.area} м²`, icon: 'Maximize2' },
    { label: 'Цена за м²', value: listing.area ? `${fmt(Math.round(listing.price / listing.area))} ₽` : '—', icon: 'Calculator' },
  ];

  // Расположение
  const location: OverviewRow[] = [
    { label: 'Город', value: listing.city || '—' },
    { label: 'Адрес', value: listing.address || '—' },
    { label: 'Район', value: listing.district || '—' },
    listing.subway_station ? { label: 'Метро', value: `${listing.subway_station}${listing.subway_distance ? ` · ${listing.subway_distance} м` : ''}` } : null,
    listing.road_line ? { label: 'Линия', value: roadLineLabel } : null,
  ].filter(Boolean) as OverviewRow[];

  // Характеристики
  const props: OverviewRow[] = [
    listing.floor != null ? { label: 'Этаж', value: `${listing.floor} из ${listing.total_floors ?? '?'}` } : null,
    listing.rooms != null ? { label: 'Помещений / комнат', value: String(listing.rooms) } : null,
    { label: 'Состояние', value: conditionLabel },
    { label: 'Отделка', value: finishingLabel },
    listing.ceiling_height ? { label: 'Высота потолков', value: `${listing.ceiling_height} м` } : null,
    listing.electricity_kw ? { label: 'Электричество', value: `${listing.electricity_kw} кВт` } : null,
    { label: 'Парковка', value: parkingLabel },
    { label: 'Вход', value: entranceLabel },
    listing.has_furniture ? { label: 'Мебель', value: 'Есть' } : null,
    listing.has_equipment ? { label: 'Оборудование', value: 'Есть' } : null,
    listing.utilities ? { label: 'Коммунальные', value: listing.utilities } : null,
  ].filter(Boolean) as OverviewRow[];

  // Здание / земля
  const building: OverviewRow[] = [
    listing.building_class ? { label: 'Класс здания', value: listing.building_class } : null,
    listing.building_year ? { label: 'Год постройки', value: String(listing.building_year) } : null,
    listing.is_apartments ? { label: 'Тип', value: 'Апартаменты' } : null,
    listing.land_area ? { label: 'Площадь участка', value: `${listing.land_area} соток` } : null,
    listing.land_status ? { label: 'Статус земли', value: listing.land_status } : null,
    listing.min_area ? { label: 'Мин. площадь', value: `${listing.min_area} м²` } : null,
  ].filter(Boolean) as OverviewRow[];

  // Доходность (для аренды/ГАБ)
  const income: OverviewRow[] = [
    listing.monthly_rent ? { label: 'Аренда / мес', value: `${fmt(listing.monthly_rent)} ₽` } : null,
    listing.yearly_rent ? { label: 'Аренда / год', value: `${fmt(listing.yearly_rent)} ₽` } : null,
    listing.payback ? { label: 'Окупаемость', value: `${listing.payback} лет` } : null,
    listing.profit ? { label: 'Прибыль', value: `${fmt(listing.profit)} ₽/мес` } : null,
    listing.tenant_name ? { label: 'Текущий арендатор', value: listing.tenant_name } : null,
  ].filter(Boolean) as OverviewRow[];

  // Юридическое и сотрудничество
  const legal: OverviewRow[] = [
    listing.property_rights ? { label: 'Права собственности', value: listing.property_rights } : null,
    listing.broker_commission ? { label: 'Комиссия брокера', value: listing.broker_commission } : null,
    { label: 'Собственник', value: listing.owner_name || '—' },
    { label: 'Телефон', value: listing.owner_phone || '—' },
    listing.owner_phone2 ? { label: 'Доп. телефон', value: listing.owner_phone2 } : null,
  ].filter(Boolean) as OverviewRow[];

  const siteSlug = listing.slug;
  const siteLink = siteUrl && siteSlug ? `${siteUrl.replace(/\/$/, '')}/object/${siteSlug}` : null;

  return (
    <div className="p-5 space-y-4">
      {/* Мини-статистика наверху */}
      <OverviewStatsHeader listingId={listing.id} />

      {/* Главные показатели — большая карточка */}
      <div className="grid grid-cols-3 gap-2">
        {headline.map(r => (
          <div key={r.label} className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl px-4 py-3">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              {r.icon && <Icon name={r.icon} size={11} />}
              {r.label}
            </div>
            <div className="text-base font-display font-700 mt-0.5">{r.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <OverviewBlock title="Расположение" icon="MapPin" rows={location} />
        <OverviewBlock title="Характеристики" icon="Settings2" rows={props} />
        {building.length > 0 && <OverviewBlock title="Здание / земля" icon="Building2" rows={building} />}
        {income.length > 0 && <OverviewBlock title="Доходность" icon="TrendingUp" rows={income} />}
        <OverviewBlock title="Сотрудничество" icon="Handshake" rows={legal} />
      </div>

      <div className="bg-white rounded-xl border border-border p-4">
        <div className="text-sm font-semibold mb-2 inline-flex items-center gap-2">
          <Icon name="Megaphone" size={14} className="text-brand-blue" />
          Площадки размещения
        </div>
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
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="text-sm font-semibold mb-2 inline-flex items-center gap-2">
            <Icon name="FileText" size={14} className="text-brand-blue" />
            Описание
          </div>
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