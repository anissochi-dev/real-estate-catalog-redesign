import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';
import { Listing, DEALS, fmtDate, perM2, splitImages } from './types';

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
}

function PhotoCell({ it }: { it: Listing; siteUrl?: string; onPhotoDownload?: (it: Listing) => void }) {
  const imgs = splitImages(it.images);
  const mainImg = imgs[0] || it.image;

  const openSite = () => {
    const slug = it.slug || it.id;
    try { localStorage.removeItem(VIEW_KEY); } catch { /* ignore */ }
    window.open(`/object/${slug}`, '_blank');
  };

  return (
    <div
      className="relative w-16 h-16 flex-shrink-0 cursor-pointer group"
      onClick={openSite}
      title="Открыть объект на сайте"
    >
      {mainImg ? (
        <img src={mainImg} alt={it.title}
          className="w-16 h-16 rounded-lg object-cover border border-border group-hover:opacity-80 transition-opacity" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center border border-border">
          <Icon name="Image" size={20} className="text-muted-foreground" />
        </div>
      )}
      {imgs.length > 1 && (
        <span className="absolute -bottom-1 -right-1 bg-brand-blue text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {imgs.length}
        </span>
      )}
    </div>
  );
}

export default function ListingsTable({
  items, onEdit, onArchive, onHistory, onPhotoDownload, onInternalCard,
  selected, onToggleSelect, onSelectAll, onDeselectAll,
  siteUrl,
}: Props) {
  const { user } = useAuth();
  const canSeeFullDetails = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);
  const dealMeta = (d: string) => DEALS.find(x => x[0] === d);
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-3 w-8">
              <input type="checkbox" checked={allSelected}
                onChange={allSelected ? onDeselectAll : onSelectAll}
                className="rounded" />
            </th>
            <th className="px-3 py-3">Фото</th>
            <th className="px-3 py-3">Объект</th>
            <th className="px-3 py-3">Сделка</th>
            <th className="px-3 py-3">Цена</th>
            <th className="px-3 py-3">Статистика</th>
            <th className="px-3 py-3">Собственник</th>
            <th className="px-3 py-3">Создан</th>
            <th className="px-3 py-3">Изменён</th>
            <th className="px-3 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => {
            const dm = dealMeta(it.deal);
            const m2 = perM2(it.price, it.area);
            return (
              <tr key={it.id}
                className={`border-t border-border hover:bg-muted/30 align-top ${selected.has(it.id) ? 'bg-brand-blue/5' : ''} ${it.is_visible === false ? 'bg-red-50/60' : ''}`}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(it.id)}
                    onChange={() => onToggleSelect(it.id)} className="rounded" />
                </td>
                <td className="px-3 py-3">
                  <PhotoCell it={it} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {onInternalCard ? (
                      <button
                        onClick={() => onInternalCard(it)}
                        className="font-semibold text-left hover:text-brand-blue hover:underline transition-colors"
                        title="Открыть карточку брокера"
                      >
                        {it.title}
                      </button>
                    ) : (
                      <div className="font-semibold">{it.title}</div>
                    )}
                    {it.public_code ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue">
                        ID {it.public_code}
                      </span>
                    ) : null}
                    {it.is_visible === false && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 inline-flex items-center gap-0.5">
                        <Icon name="EyeOff" size={10} /> Скрыт
                      </span>
                    )}
                    {it.status === 'archived' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        Архив
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.city || 'Краснодар'}{it.district ? ` · ${it.district}` : ''}
                    {canSeeFullDetails && it.address ? <div>{it.address}</div> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{it.area} м²</div>
                </td>
                <td className="px-3 py-3">
                  {dm && (
                    <span className={`text-xs px-2 py-0.5 rounded ${dm[2]} font-semibold`}>{dm[1]}</span>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <div className="font-semibold">{(it.price || 0).toLocaleString('ru')} ₽</div>
                  {m2 > 0 && <div className="text-xs text-muted-foreground">{m2.toLocaleString('ru')} ₽/м²</div>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <button onClick={() => onInternalCard?.(it)} title="Открыть статистику"
                    className="flex items-center gap-2 text-xs hover:text-brand-blue">
                    <span className="inline-flex items-center gap-1" title="Просмотры">
                      <Icon name="Eye" size={11} className="text-brand-blue" />
                      {(it.stats_views ?? 0).toLocaleString('ru')}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Звонки">
                      <Icon name="Phone" size={11} className="text-emerald-600" />
                      {(it.stats_calls ?? 0).toLocaleString('ru')}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Заявки">
                      <Icon name="Inbox" size={11} className="text-brand-orange" />
                      {(it.stats_leads ?? 0).toLocaleString('ru')}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3 text-xs">
                  {it.owner_name && <div>{it.owner_name}</div>}
                  {it.owner_phone && (() => {
                    const isAdminOrDirector = user?.role && ['admin', 'director'].includes(user.role);
                    const isBrokerAuthor = user?.role === 'broker' && (it.author_id === user?.id || it.broker_id === user?.id);
                    const showPhone = isAdminOrDirector || isBrokerAuthor;
                    return showPhone
                      ? <a href={`tel:${it.owner_phone}`} className="text-brand-blue hover:underline">{it.owner_phone}</a>
                      : <span className="text-muted-foreground">+7 ***</span>;
                  })()}
                  {!it.owner_name && !it.owner_phone && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{fmtDate(it.created_at)}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{fmtDate(it.updated_at)}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => onHistory(it)} title="История и статистика"
                      className="text-muted-foreground hover:text-brand-blue">
                      <Icon name="BarChart2" size={16} />
                    </button>
                    <button onClick={() => onEdit(it)} className="text-brand-blue hover:opacity-70">
                      <Icon name="Pencil" size={16} />
                    </button>
                    <button
                      onClick={() => onArchive(it.id)}
                      title={it.status === 'archived' ? 'Восстановить' : 'Архивировать'}
                      className={it.status === 'archived' ? 'text-emerald-600 hover:opacity-70' : 'text-orange-500 hover:opacity-70'}>
                      <Icon name={it.status === 'archived' ? 'RotateCcw' : 'Archive'} size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}