import Icon from '@/components/ui/icon';
import { Listing, DEALS, fmtDate, perM2, splitImages } from './types';

interface Props {
  items: Listing[];
  onEdit: (it: Listing) => void;
  onArchive: (id: number) => void;
}

export default function ListingsTable({ items, onEdit, onArchive }: Props) {
  const dealMeta = (d: string) => DEALS.find(x => x[0] === d);

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-3">Фото</th>
            <th className="px-3 py-3">Объект</th>
            <th className="px-3 py-3">Сделка</th>
            <th className="px-3 py-3">Цена</th>
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
            const mainImg = splitImages(it.images)[0] || it.image;
            return (
              <tr key={it.id} className="border-t border-border hover:bg-muted/30 align-top">
                <td className="px-3 py-3">
                  {mainImg ? (
                    <img src={mainImg} alt={it.title}
                      className="w-16 h-16 rounded-lg object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Icon name="Image" size={20} className="text-muted-foreground" />
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">{it.title}</div>
                    {it.public_code ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue">
                        ID {it.public_code}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.city || 'Краснодар'}{it.district ? ` · ${it.district}` : ''}
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
                <td className="px-3 py-3 text-xs">
                  {it.owner_name && <div>{it.owner_name}</div>}
                  {it.owner_phone && (
                    <a href={`tel:${it.owner_phone}`} className="text-brand-blue hover:underline">{it.owner_phone}</a>
                  )}
                  {!it.owner_name && !it.owner_phone && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{fmtDate(it.created_at)}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{fmtDate(it.updated_at)}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(it)} className="text-brand-blue hover:underline mr-3">
                    <Icon name="Pencil" size={16} />
                  </button>
                  <button onClick={() => onArchive(it.id)} className="text-red-600 hover:underline">
                    <Icon name="Archive" size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}