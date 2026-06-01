import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing, CONDITIONS, PARKING, ENTRANCE, FINISHING, ROAD_LINES, LAND_STATUSES, PROPERTY_RIGHTS } from './types';
import { StatData, fmt } from './internalCardTypes';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon name="Loader2" size={24} className="animate-spin text-brand-blue" />
    </div>
  );
}

export function translate(value: string | null | undefined, map: readonly (readonly string[])[]): string {
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

  const headline: OverviewRow[] = [
    { label: 'Цена', value: `${fmt(listing.price)} ₽`, icon: 'Banknote' },
    { label: 'Площадь', value: `${listing.area} м²`, icon: 'Maximize2' },
    { label: 'Цена за м²', value: listing.area ? `${fmt(Math.round(listing.price / listing.area))} ₽` : '—', icon: 'Calculator' },
  ];

  const location: OverviewRow[] = [
    { label: 'Город', value: listing.city || '—' },
    { label: 'Адрес', value: listing.address || '—' },
    { label: 'Район', value: listing.district || '—' },
    listing.subway_station ? { label: 'Метро', value: `${listing.subway_station}${listing.subway_distance ? ` · ${listing.subway_distance} м` : ''}` } : null,
    listing.road_line ? { label: 'Линия', value: roadLineLabel } : null,
  ].filter(Boolean) as OverviewRow[];

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

  const isLand = listing.category === 'land';
  const sotki = isLand && listing.area ? +(listing.area / 100).toFixed(2) : null;
  const building: OverviewRow[] = [
    listing.building_class ? { label: 'Класс здания', value: listing.building_class } : null,
    listing.building_year ? { label: 'Год постройки', value: String(listing.building_year) } : null,
    listing.is_apartments ? { label: 'Тип', value: 'Апартаменты' } : null,
    sotki ? { label: 'Площадь участка', value: `${sotki.toLocaleString('ru')} соток` } : null,
    listing.land_status ? { label: 'Категория земли', value: translate(listing.land_status, LAND_STATUSES) } : null,
    listing.land_vri ? { label: 'Вид разрешённого использования', value: listing.land_vri } : null,
    listing.min_area ? { label: 'Мин. площадь', value: `${listing.min_area} м²` } : null,
  ].filter(Boolean) as OverviewRow[];

  const income: OverviewRow[] = [
    listing.monthly_rent ? { label: 'Аренда / мес', value: `${fmt(listing.monthly_rent)} ₽` } : null,
    listing.yearly_rent ? { label: 'Аренда / год', value: `${fmt(listing.yearly_rent)} ₽` } : null,
    listing.payback ? { label: 'Окупаемость', value: `${listing.payback} лет` } : null,
    listing.profit ? { label: 'Прибыль', value: `${fmt(listing.profit)} ₽/мес` } : null,
    listing.tenant_name ? { label: 'Текущий арендатор', value: listing.tenant_name } : null,
  ].filter(Boolean) as OverviewRow[];

  const legal: OverviewRow[] = [
    listing.property_rights ? { label: 'Права собственности', value: translate(listing.property_rights, PROPERTY_RIGHTS) } : null,
    listing.broker_commission ? { label: 'Комиссия брокера', value: listing.broker_commission } : null,
    { label: 'Собственник', value: listing.owner_name || '—' },
    { label: 'Телефон', value: listing.owner_phone || '—' },
    listing.owner_phone2 ? { label: 'Доп. телефон', value: listing.owner_phone2 } : null,
  ].filter(Boolean) as OverviewRow[];

  const siteSlug = listing.slug;
  const siteLink = siteUrl && siteSlug ? `${siteUrl.replace(/\/$/, '')}/object/${siteSlug}` : null;

  return (
    <div className="p-5 space-y-4">
      <OverviewStatsHeader listingId={listing.id} />

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
