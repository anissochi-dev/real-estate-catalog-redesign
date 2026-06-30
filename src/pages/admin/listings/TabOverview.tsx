import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing, CONDITIONS, PARKING, ENTRANCE, FINISHING, ROAD_LINES, LAND_STATUSES, PROPERTY_RIGHTS, EgrnStoredObject } from './types';
import { StatData, fmt, translate } from './internalCardTypes';
import { useAuth } from '@/contexts/AuthContext';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon name="Loader2" size={24} className="animate-spin text-brand-blue" />
    </div>
  );
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

function EgrnOverviewBlock({ objects }: { objects: EgrnStoredObject[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  if (!objects.length) return null;

  const typeIcon = (type?: string) =>
    type === 'Земельный участок' ? 'Landmark' : type === 'Помещение' ? 'DoorOpen' : 'Building2';

  const statusClass = (status?: string) =>
    status === 'Актуально' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'Погашено' ? 'bg-gray-100 text-gray-500 border-gray-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <Icon name="FileSearch" size={14} className="text-brand-blue" />
        <span className="text-sm font-semibold">Выписка ЕГРН</span>
        <span className="text-[11px] text-muted-foreground ml-auto">{objects.length} {objects.length === 1 ? 'объект' : 'объекта'}</span>
      </div>

      <div className="divide-y divide-border">
        {objects.map((obj, i) => (
          <div key={obj.cadastral_number}>
            {/* Заголовок объекта */}
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
            >
              <Icon name={typeIcon(obj.type)} size={13} className="text-brand-blue flex-shrink-0" />
              <span className="font-mono text-xs font-semibold text-foreground flex-1 truncate">{obj.cadastral_number}</span>
              {obj.type && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue font-medium flex-shrink-0">{obj.type}</span>
              )}
              {obj.status && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${statusClass(obj.status)}`}>{obj.status}</span>
              )}
              {obj.area && (
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{obj.area} м²</span>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                <a
                  href={`https://pkk.rosreestr.ru/#/?text=${encodeURIComponent(obj.cadastral_number)}&type=1`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] text-brand-blue hover:underline flex items-center gap-0.5"
                >
                  <Icon name="Map" size={11} />ПКК
                </a>
                <a
                  href={`https://rosreestr.gov.ru/eservices/real-estate-objects-online/?search=${encodeURIComponent(obj.cadastral_number)}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] text-brand-blue hover:underline flex items-center gap-0.5"
                >
                  <Icon name="FileText" size={11} />ЕГРН
                </a>
              </div>
              <Icon name={openIdx === i ? 'ChevronUp' : 'ChevronDown'} size={13} className="text-muted-foreground flex-shrink-0" />
            </button>

            {/* Детали */}
            {openIdx === i && (
              <div className="px-4 pb-3 space-y-2.5 bg-muted/10">
                {obj.address && (
                  <div className="text-xs text-muted-foreground flex items-start gap-1 pt-1">
                    <Icon name="MapPin" size={11} className="flex-shrink-0 mt-0.5" />
                    <span>{obj.address}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {obj.area && <div><span className="text-muted-foreground">Площадь:</span> <span className="font-medium">{obj.area} м²</span></div>}
                  {obj.floor && <div><span className="text-muted-foreground">Этаж:</span> <span className="font-medium">{obj.floor}</span></div>}
                  {obj.purpose && <div><span className="text-muted-foreground">Назначение:</span> <span className="font-medium">{obj.purpose}</span></div>}
                  {obj.ownership && <div><span className="text-muted-foreground">Собственность:</span> <span className="font-medium">{obj.ownership}</span></div>}
                  {obj.reg_date && <div><span className="text-muted-foreground">Дата регистрации:</span> <span className="font-medium">{obj.reg_date}</span></div>}
                  {obj.cad_cost && <div><span className="text-muted-foreground">Кад. стоимость:</span> <span className="font-medium">{Number(obj.cad_cost).toLocaleString('ru')} ₽</span></div>}
                </div>

                {/* Обременения */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Icon name="Lock" size={11} />Обременения:
                  </div>
                  {obj.encumbrances && obj.encumbrances.length > 0 ? (
                    <div className="space-y-1">
                      {obj.encumbrances.map((e, ei) => (
                        <div key={ei} className="text-xs bg-red-50 border border-red-100 rounded px-2 py-1 text-red-700">
                          {e.type}{e.date ? ` от ${e.date}` : ''}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-600 flex items-center gap-1">
                      <Icon name="CheckCircle" size={12} />Не зарегистрированы
                    </div>
                  )}
                </div>

                {/* Права */}
                {obj.rights && obj.rights.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Icon name="Users" size={11} />Права ({obj.rights.length}):
                    </div>
                    <div className="space-y-1">
                      {obj.rights.map((r, ri) => (
                        <div key={ri} className="text-xs bg-muted rounded px-2 py-1">
                          <span className="font-medium">{r.type}</span>
                          {r.date && <span className="text-muted-foreground"> от {r.date}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {obj.fetched_at && (
                  <div className="text-[10px] text-muted-foreground pt-1">
                    Получено: {new Date(obj.fetched_at).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabOverview({ listing, siteUrl }: { listing: Listing; siteUrl?: string }) {
  const { user } = useAuth();
  const conditionLabel = translate(listing.condition, CONDITIONS);
  const parkingLabel = translate(listing.parking, PARKING);
  const entranceLabel = translate(listing.entrance, ENTRANCE);
  const finishingLabel = translate(listing.finishing ?? null, FINISHING);
  const roadLineLabel = translate(listing.road_line ?? null, ROAD_LINES);

  // Контакты собственника видит: admin, director, broker (только свой объект)
  const canSeeOwner = user && (
    ['admin', 'director'].includes(user.role) ||
    (user.role === 'broker' && (listing.broker_id === user.id || (listing as { author_id?: number | null }).author_id === user.id))
  );

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
    canSeeOwner ? { label: 'Собственник', value: listing.owner_name || '—' } : null,
    canSeeOwner ? { label: 'Телефон', value: listing.owner_phone || '—' } : null,
    canSeeOwner && listing.owner_phone2 ? { label: 'Доп. телефон', value: listing.owner_phone2 } : null,
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
        <div className="space-y-3">
          <OverviewBlock title="Расположение" icon="MapPin" rows={location} />
          {listing.egrn_objects && listing.egrn_objects.length > 0 && (
            <EgrnOverviewBlock objects={listing.egrn_objects} />
          )}
        </div>
        <OverviewBlock title="Характеристики" icon="Settings2" rows={props} />
        {building.length > 0 && <OverviewBlock title="Здание / земля" icon="Building2" rows={building} />}
        {income.length > 0 && (
          <div className="space-y-3">
            <OverviewBlock title="Доходность" icon="TrendingUp" rows={income} />
            {listing.monthly_rent && listing.rent_index_pct ? (() => {
              const map = listing.monthly_rent!;
              const pct = listing.rent_index_pct!;
              const step = Math.round(map * pct / 100);
              const rows = Array.from({ length: 10 }, (_, i) => ({
                year: i + 1,
                monthly: map + step * (i + 1),
                yearly: (map + step * (i + 1)) * 12,
              }));
              return (
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                    <Icon name="TrendingUp" size={14} className="text-emerald-600" />
                    <span className="text-sm font-semibold">Прогноз индексации {pct}% / год</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">+{step.toLocaleString('ru')} ₽/мес ежегодно</span>
                  </div>
                  <div className="divide-y divide-border">
                    {rows.map(r => (
                      <div key={r.year} className="grid grid-cols-3 px-4 py-1.5 text-xs hover:bg-muted/20">
                        <span className="text-muted-foreground">Год {r.year}</span>
                        <span className="font-medium">{r.monthly.toLocaleString('ru')} ₽/мес</span>
                        <span className="text-muted-foreground text-right">{r.yearly.toLocaleString('ru')} ₽/год</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : null}
          </div>
        )}
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