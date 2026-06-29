import Icon from '@/components/ui/icon';
import { Listing, DEALS, fmtDate, perM2, splitImages } from './types';
import { fmtListingId } from '@/lib/formatPrice';
import { listingSlug } from '@/lib/slug';
import { useExitToPath } from '../AdminLayout';
import ListingsTableExportBadges from './ListingsTableExportBadges';

interface Props {
  it: Listing;
  isSelected: boolean;
  canSelect: boolean;
  canEdit: boolean;
  showPhone: boolean;
  canSeeFullDetails: boolean;
  onToggleSelect: (id: number) => void;
  onEdit: (it: Listing) => void;
  onArchive: (id: number) => void;
  onHistory: (it: Listing) => void;
  onInternalCard?: (it: Listing) => void;
  onModerate?: (id: number, action: 'approve' | 'reject') => void;
}

export default function ListingsTableDesktopRow({
  it, isSelected, canSelect, canEdit, showPhone, canSeeFullDetails,
  onToggleSelect, onEdit, onArchive, onHistory, onInternalCard, onModerate,
}: Props) {
  const exitToPath = useExitToPath();
  const dealMeta = (d: string) => DEALS.find(x => x[0] === d);
  const dm = dealMeta(it.deal);
  const m2 = perM2(it.price, it.area);
  const imgs = splitImages(it.images);
  const mainImg = it.image_thumb || imgs[0] || it.image;
  const isArchived = it.status === 'archived';
  const isHidden = it.is_visible === false;
  const isModeration = it.status === 'moderation';

  return (
    <div className="hidden sm:flex gap-0 flex-row">

      {/* ── Чекбокс-полоска слева ── */}
      <div
        className={[
          'flex items-center justify-center w-10 flex-shrink-0 transition-colors',
          canSelect ? 'cursor-pointer' : 'cursor-default',
          isSelected ? 'bg-brand-blue/10' : canSelect ? 'bg-muted/30 hover:bg-muted/60' : 'bg-muted/10',
        ].join(' ')}
        onClick={() => canSelect && onToggleSelect(it.id)}
      >
        {canSelect ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(it.id)}
            onClick={e => e.stopPropagation()}
            className="rounded accent-brand-blue w-4 h-4"
          />
        ) : (
          <Icon name="Lock" size={12} className="text-muted-foreground/30" />
        )}
      </div>

      {/* ── Фото (десктоп) ── */}
      <div
        className="relative flex-shrink-0 w-48 overflow-hidden cursor-pointer"
        style={{ height: 160 }}
        title="Открыть на сайте"
        onClick={e => {
          e.stopPropagation();
          exitToPath?.(`/object/${listingSlug(it.title, it.id)}`);
        }}
      >
        {mainImg ? (
          <img
            src={mainImg}
            alt={it.title}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200 group-hover:opacity-90"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <Icon name="Image" size={36} className="text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
          <span className="bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
            <Icon name="ExternalLink" size={11} />
            На сайте
          </span>
        </div>
        {imgs.length > 1 && (
          <span className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Icon name="Images" size={10} />
            {imgs.length}
          </span>
        )}
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

      {/* ── Основной контент (справа от фото) ── */}
      <div className="flex flex-1 min-w-0 flex-col py-3 px-4 gap-0">

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
              #{fmtListingId(it.id, it.created_at)}
            </span>
            <button
              onClick={() => onHistory(it)}
              title="История и статистика"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-brand-blue transition-colors"
            >
              <Icon name="BarChart2" size={14} />
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

        {/* Баннер модерации с кнопками Принять / Отклонить */}
        {isModeration && onModerate && (
          <div className="flex items-center gap-2 mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Icon name="Clock" size={13} className="text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-amber-800">От собственника — на модерации</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={e => { e.stopPropagation(); if (confirm('Одобрить объект и опубликовать в каталоге?')) onModerate(it.id, 'approve'); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition"
                title="Одобрить объект и опубликовать в каталоге"
              >
                <Icon name="CheckCircle" size={11} /> Принять
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (confirm('Отклонить объект? Он уйдёт в архив.')) onModerate(it.id, 'reject'); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition"
                title="Отклонить — объект уйдёт в архив"
              >
                <Icon name="X" size={11} /> Отклонить
              </button>
            </div>
          </div>
        )}

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
          <ListingsTableExportBadges it={it} />
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

          {/* Брокер */}
          {it.broker_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon name="UserCheck" size={12} className="text-brand-blue/60 flex-shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">{it.broker_name}</span>
            </div>
          )}

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
  );
}
