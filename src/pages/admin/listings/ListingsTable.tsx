import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';
import { Listing, DEALS, fmtDate, perM2, splitImages } from './types';
import { fmtListingId } from '@/lib/formatPrice';
import ListingInlineActions from './ListingInlineActions';

const VIEW_KEY = 'biznest_view';

interface Props {
  items: Listing[];
  onEdit: (it: Listing) => void;
  onArchive: (id: number) => void;
  onHistory: (it: Listing) => void;
  onPhotoDownload: (it: Listing) => void;
  onInternalCard?: (it: Listing) => void;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  siteUrl?: string;
  // bulk actions
  onBulk?: (op: string, value?: unknown) => void;
  onBulkDelete?: () => void;
  bulkLoading?: boolean;
  isAdmin?: boolean;
}

function openSite(it: Listing) {
  const slug = it.slug || it.id;
  try { localStorage.removeItem(VIEW_KEY); } catch { /* ignore */ }
  window.open(`/object/${slug}`, '_blank');
}

function ExportBadges({ it }: { it: Listing }) {
  if (!it.export_yandex && !it.export_avito && !it.export_cian) return null;
  return (
    <div className="flex items-center gap-1">
      {it.export_yandex && (
        <span title="Яндекс.Недвижимость"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Я</span>
      )}
      {it.export_avito && (
        <span title="Авито"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">А</span>
      )}
      {it.export_cian && (
        <span title="ЦИАН"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">Ц</span>
      )}
    </div>
  );
}

export default function ListingsTable({
  items, onEdit, onArchive, onHistory, onPhotoDownload, onInternalCard,
  selected, onToggleSelect, onSelectAll, onDeselectAll,
  onBulk, onBulkDelete, bulkLoading = false, isAdmin = false,
}: Props) {
  const { user } = useAuth();
  const canSeeFullDetails = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);
  const dealMeta = (d: string) => DEALS.find(x => x[0] === d);
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));

  return (
    <div className="space-y-0.5">

      {/* ── Шапка с чекбоксом «Выбрать все» ── */}
      <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-xl border border-border shadow-sm mb-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={allSelected ? onDeselectAll : onSelectAll}
          className="rounded accent-brand-blue w-4 h-4 flex-shrink-0"
        />
        <span className="text-xs text-muted-foreground font-medium">
          {selected.size > 0
            ? `Выбрано: ${selected.size} из ${items.length}`
            : `Выбрать все (${items.length})`}
        </span>
      </div>

      {/* ── Карточки ── */}
      {items.map(it => {
        const dm = dealMeta(it.deal);
        const m2 = perM2(it.price, it.area);
        const imgs = splitImages(it.images);
        const mainImg = imgs[0] || it.image;
        const isSelected = selected.has(it.id);
        const isHidden = it.is_visible === false;
        const showPhone = true;
        const canEdit = !['client'].includes(user?.role || '');
        const isArchived = it.status === 'archived';

        return (
          <div key={it.id} className="space-y-0">

            {/* ── Полоса действий НАД карточкой (при выборе) ── */}
            {isSelected && onBulk && onBulkDelete && (
              <div className="rounded-t-2xl overflow-visible">
                <ListingInlineActions
                  listingId={it.id}
                  onBulk={onBulk}
                  onBulkDelete={onBulkDelete}
                  bulkLoading={bulkLoading}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {/* ── Сама карточка ── */}
          <div
            className={[
              'group flex gap-0 bg-white border overflow-hidden shadow-sm transition-all duration-150',
              isSelected ? 'rounded-b-2xl rounded-t-none' : 'rounded-2xl',
              'hover:shadow-md hover:border-brand-blue/30',
              isSelected ? 'border-brand-blue/50 border-t-0' : 'border-border',
              isHidden ? 'opacity-70' : '',
              isArchived ? 'opacity-60' : '',
            ].filter(Boolean).join(' ')}
          >
            {/* ── Чекбокс-полоска слева ── */}
            <div
              className={[
                'flex items-center justify-center w-10 flex-shrink-0 cursor-pointer transition-colors',
                isSelected ? 'bg-brand-blue/10' : 'bg-muted/30 hover:bg-muted/60',
              ].join(' ')}
              onClick={() => onToggleSelect(it.id)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(it.id)}
                onClick={e => e.stopPropagation()}
                className="rounded accent-brand-blue w-4 h-4"
              />
            </div>

            {/* ── Фото ── */}
            <div
              className="relative flex-shrink-0 w-48 cursor-pointer overflow-hidden"
              onClick={() => openSite(it)}
              title="Открыть объект на сайте"
            >
              {mainImg ? (
                <img
                  src={mainImg}
                  alt={it.title}
                  className="w-full h-full object-cover transition-opacity duration-200 group-hover:opacity-90"
                  style={{ minHeight: 140 }}
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center" style={{ minHeight: 140 }}>
                  <Icon name="Image" size={36} className="text-muted-foreground/40" />
                </div>
              )}
              {/* Оверлей при hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
              {/* Счётчик фото */}
              {imgs.length > 1 && (
                <span className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Icon name="Images" size={10} />
                  {imgs.length}
                </span>
              )}
              {/* Статус-метка поверх фото */}
              {(isHidden || isArchived) && (
                <div className="absolute top-2 left-2">
                  {isHidden && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-1 shadow">
                      <Icon name="EyeOff" size={9} /> Скрыт
                    </span>
                  )}
                  {isArchived && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white shadow">
                      Архив
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Основной контент ── */}
            <div className="flex-1 min-w-0 flex flex-col py-3 px-4 gap-0">

              {/* Строка 1: Название + ID + кнопки */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onInternalCard?.(it)}
                    className="font-semibold text-[15px] leading-snug text-left hover:text-brand-blue transition-colors line-clamp-2"
                  >
                    {it.title}
                  </button>
                </div>
                {/* ID + действия */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue">
                    #{fmtListingId(it.id)}
                  </span>
                  <button
                    onClick={() => onHistory(it)}
                    title="История и статистика"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-brand-blue transition-colors"
                  >
                    <Icon name="BarChart2" size={14} />
                  </button>
                  <button
                    onClick={() => openSite(it)}
                    title="Открыть на сайте"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-brand-orange transition-colors"
                  >
                    <Icon name="ExternalLink" size={14} />
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => onEdit(it)}
                      title="Редактировать"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue transition-colors"
                    >
                      <Icon name="Pencil" size={14} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => onArchive(it.id)}
                      title={isArchived ? 'Восстановить' : 'Архивировать'}
                      className={[
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                        isArchived
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-muted-foreground hover:bg-orange-50 hover:text-orange-500',
                      ].join(' ')}
                    >
                      <Icon name={isArchived ? 'RotateCcw' : 'Archive'} size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Строка 2: Адрес */}
              <div className="flex items-center gap-1.5 mt-1">
                <Icon name="MapPin" size={12} className="text-muted-foreground/60 flex-shrink-0" />
                <span className="text-xs text-muted-foreground truncate">
                  {[it.city || 'Краснодар', it.district, canSeeFullDetails ? it.address : null]
                    .filter(Boolean).join(' · ')}
                </span>
              </div>

              {/* Строка 3: Сделка + Цена + Площадь + Экспорт */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {dm && (
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${dm[2]}`}>
                    {dm[1]}
                  </span>
                )}
                <div>
                  <span className="text-base font-bold text-foreground leading-none">
                    {(it.price || 0).toLocaleString('ru')} ₽
                  </span>
                  {m2 > 0 && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {m2.toLocaleString('ru')} ₽/м²
                    </span>
                  )}
                </div>
                {it.area ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon name="Maximize" size={11} className="opacity-60" />
                    {it.area} м²
                  </span>
                ) : null}
                <ExportBadges it={it} />
              </div>

              {/* Разделитель */}
              <div className="border-t border-border/60 mt-2.5 mb-2" />

              {/* Строка 4: Статистика + Собственник + Даты */}
              <div className="flex items-center justify-between gap-4 flex-wrap">

                {/* Статистика */}
                <button
                  onClick={() => onInternalCard?.(it)}
                  title="Открыть внутреннюю карточку"
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground" title="Просмотры">
                    <Icon name="Eye" size={13} className="text-brand-blue" />
                    {(it.stats_views ?? 0).toLocaleString('ru')}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground" title="Звонки">
                    <Icon name="Phone" size={13} className="text-emerald-500" />
                    {(it.stats_calls ?? 0).toLocaleString('ru')}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground" title="Заявки">
                    <Icon name="Inbox" size={13} className="text-brand-orange" />
                    {(it.stats_leads ?? 0).toLocaleString('ru')}
                  </span>
                </button>

                {/* Собственник */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon name="User" size={12} className="text-muted-foreground/50 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground truncate">
                    {it.owner_name && <span className="font-medium text-foreground">{it.owner_name}</span>}
                    {it.owner_phone && (
                      <span className="ml-1.5">
                        {showPhone
                          ? <a href={`tel:${it.owner_phone}`} className="text-brand-blue hover:underline" onClick={e => e.stopPropagation()}>{it.owner_phone}</a>
                          : <span className="text-muted-foreground">+7 •••</span>}
                      </span>
                    )}
                    {!it.owner_name && !it.owner_phone && '—'}
                  </div>
                </div>

                {/* Даты */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 flex-shrink-0">
                  <span title="Дата создания">
                    <Icon name="CalendarPlus" size={11} className="inline mr-1 opacity-60" />
                    {fmtDate(it.created_at)}
                  </span>
                  {it.updated_at && it.updated_at !== it.created_at && (
                    <span title="Дата изменения">
                      <Icon name="CalendarCheck" size={11} className="inline mr-1 opacity-60" />
                      {fmtDate(it.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

          </div>
          </div>
        );
      })}
    </div>
  );
}