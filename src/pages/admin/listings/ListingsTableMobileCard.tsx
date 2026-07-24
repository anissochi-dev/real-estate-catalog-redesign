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
  siteUrl?: string;
  onToggleSelect: (id: number) => void;
  onEdit: (it: Listing) => void;
  onCopy?: (it: Listing) => void;
  onHistory: (it: Listing) => void;
  onInternalCard?: (it: Listing) => void;
  onShowMatching?: (id: number) => void;
}

export default function ListingsTableMobileCard({
  it, isSelected, canSelect, canEdit, showPhone, siteUrl,
  onToggleSelect, onEdit, onCopy, onHistory, onInternalCard, onShowMatching,
}: Props) {
  const exitToPath = useExitToPath();
  const dealMeta = (d: string) => DEALS.find(x => x[0] === d);
  const dm = dealMeta(it.deal);
  const m2 = perM2(it.price, it.area);
  const imgs = splitImages(it.images);
  const mainImg = it.image_thumb || imgs[0] || it.image;
  const isArchived = it.status === 'archived';
  const isHidden = it.is_visible === false;

  return (
    <>
      {/* ── Мобильное фото — во всю ширину → переход на сайт ── */}
      <div
        className="sm:hidden relative cursor-pointer overflow-hidden w-full group"
        title="Открыть на сайте"
        onClick={e => {
          e.stopPropagation();
          exitToPath?.(`/object/${listingSlug(it.title, it.id)}`);
        }}
        style={{ aspectRatio: '16/9' }}
      >
        {mainImg ? (
          <img src={mainImg} alt={it.title} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200 group-hover:opacity-90" />
        ) : (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <Icon name="Image" size={36} className="text-muted-foreground/40" />
          </div>
        )}
        {/* Иконка "открыть на сайте" */}
        <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-white rounded-lg px-2 py-1 flex items-center gap-1 text-[10px] font-semibold opacity-80">
          <Icon name="ExternalLink" size={10} />На сайте
        </div>
        {/* Чекбокс поверх фото */}
        {canSelect && (
          <div
            className={['absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center shadow', isSelected ? 'bg-brand-blue' : 'bg-white/90'].join(' ')}
            onClick={e => { e.stopPropagation(); if (canSelect) onToggleSelect(it.id); }}
          >
            <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(it.id)} onClick={e => e.stopPropagation()} className="rounded accent-brand-blue w-4 h-4" />
          </div>
        )}
        {imgs.length > 1 && (
          <span className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Icon name="Images" size={10} />{imgs.length}
          </span>
        )}
        {(isHidden || isArchived) && (
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {isHidden && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white flex items-center gap-1 shadow"><Icon name="EyeOff" size={9} /> Скрыт</span>}
            {isArchived && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white shadow">Архив</span>}
          </div>
        )}
      </div>

      {/* ── Мобильный контент — под фото ── */}
      <div className="sm:hidden flex flex-col py-2.5 px-3 gap-0">

        {/* Строка 1: Название + кнопки действий */}
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => onInternalCard?.(it)}
            className="font-semibold text-[14px] leading-snug text-left hover:text-brand-blue transition-colors line-clamp-2 flex-1 min-w-0"
          >
            {it.title}
          </button>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue">
              #{fmtListingId(it.id, it.created_at)}
            </span>
            <button onClick={() => onHistory(it)} title="История" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-brand-blue transition-colors">
              <Icon name="BarChart2" size={13} />
            </button>
            {canEdit && (
              <button onClick={() => onEdit(it)} title="Редактировать" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue transition-colors">
                <Icon name="Pencil" size={13} />
              </button>
            )}
            {canEdit && onCopy && (
              <button onClick={() => onCopy(it)} title={it.deal === 'rent' ? 'Копировать как продажу' : 'Копировать как аренду'} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                <Icon name="Copy" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Строка 2: Адрес */}
        <div className="flex items-center gap-1 mt-1">
          <Icon name="MapPin" size={11} className="text-muted-foreground/60 flex-shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {[it.city || 'Краснодар', it.district].filter(Boolean).join(' · ')}
          </span>
        </div>

        {/* Строка 3: Тип сделки + Цена + Площадь */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {dm && (
            <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${dm[2]}`}>{dm[1]}</span>
          )}
          <span className="text-sm font-bold text-foreground leading-none">
            {(it.price || 0).toLocaleString('ru')} ₽
          </span>
          {m2 > 0 && (
            <span className="text-xs text-muted-foreground">{m2.toLocaleString('ru')} ₽/м²</span>
          )}
          {it.area ? (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Icon name="Maximize" size={10} className="opacity-60" />
              {it.area} м²
            </span>
          ) : null}
          {(it as Record<string,unknown>).rooms ? (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Icon name="LayoutGrid" size={10} className="opacity-60" />
              {String((it as Record<string,unknown>).rooms)} комн.
            </span>
          ) : null}
          {(it as Record<string,unknown>).property_rights ? (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Icon name="ShieldCheck" size={10} className="text-emerald-500 opacity-80" />
              {({'ownership':'Собств.','lease':'Аренда','sublease':'Субаренда'} as Record<string,string>)[(it as Record<string,unknown>).property_rights as string] || String((it as Record<string,unknown>).property_rights)}
            </span>
          ) : null}
          {(it as Record<string,unknown>).has_furniture && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Icon name="Sofa" size={10} className="text-orange-400 opacity-80" />
              Мебель
            </span>
          )}
          {(it as Record<string,unknown>).has_equipment && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Icon name="Settings2" size={10} className="text-slate-500 opacity-80" />
              Оборуд.
            </span>
          )}
          <ListingsTableExportBadges it={it} />
        </div>

        {/* Строка 4: Статистика + Собственник */}
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50">
          <button onClick={() => onInternalCard?.(it)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="Eye" size={12} className="text-brand-blue" />
              {(it.stats_views ?? 0).toLocaleString('ru')}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="Phone" size={12} className="text-emerald-500" />
              {(it.stats_calls ?? 0).toLocaleString('ru')}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="Inbox" size={12} className="text-brand-orange" />
              {(it.stats_leads ?? 0).toLocaleString('ru')}
            </span>
          </button>
          {onShowMatching && (
            <button
              onClick={e => { e.stopPropagation(); onShowMatching(it.id); }}
              title={(it.matching_leads_count ?? 0) > 0 ? `Подходящие заявки: ${it.matching_leads_count}` : 'Подходящих заявок не найдено'}
              className={[
                'flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-lg transition-colors shrink-0 ml-1',
                (it.matching_leads_count ?? 0) > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-600',
              ].join(' ')}
            >
              <Icon name="Users" size={11} />
              {(it.matching_leads_count ?? 0) > 0 ? it.matching_leads_count : ''}
            </button>
          )}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <Icon name="User" size={11} className="text-muted-foreground/50 flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              {it.owner_name && (
                <span className="text-[11px] font-medium text-foreground">{it.owner_name}</span>
              )}
              {it.owner_phone && showPhone && (
                <a href={`tel:${it.owner_phone}`} className="text-[10px] text-brand-blue hover:underline whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  {it.owner_phone}
                </a>
              )}
              {!it.owner_name && !it.owner_phone && <span className="text-[11px] text-muted-foreground">—</span>}
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
            {fmtDate(it.created_at)}
          </span>
        </div>
      </div>
    </>
  );
}