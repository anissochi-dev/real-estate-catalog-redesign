import { Link } from '@tanstack/react-router';
import Icon from '@/components/ui/icon';
import { listingSlug } from '@/lib/slug';
import { categoryLabel } from '@/lib/categories';
import type { Property } from '@/app/appTypes';

interface Props {
  type: string;
  similar: Property[];
  districtSlug: string | null;
  districtName: string | null;
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Перелинковка: похожие объекты раздела + ссылки на раздел и район. Рендерится на сервере. */
export default function PropertyRelated({ type, similar, districtSlug, districtName }: Props) {
  const label = categoryLabel(type);
  if (similar.length === 0 && !districtSlug) return null;

  return (
    <section className="bg-white rounded-2xl px-4 py-4 shadow-sm">
      <h2 className="font-display font-700 text-base mb-3 flex items-center gap-2">
        <Icon name="LayoutGrid" size={16} className="text-brand-blue" />
        {districtName ? `${label} в районе: ${districtName}` : `${label} в Краснодаре`}
      </h2>

      {similar.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {similar.map(p => (
            <li key={p.id}>
              <Link
                to="/object/$slug"
                params={{ slug: listingSlug(p.title, p.id) }}
                className="flex gap-3 items-center rounded-xl border border-border p-2 hover:border-brand-blue transition-colors"
              >
                {p.image && (
                  <img src={p.image_thumb || p.image} alt={p.title} loading="lazy"
                    className="w-16 h-12 rounded-lg object-cover shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground line-clamp-2">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.area} м²{p.price ? ` · ${fmt(p.price)} ₽${p.deal === 'rent' ? '/мес' : ''}` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <Link to="/catalog/$type" params={{ type }} className="inline-flex items-center gap-1 text-brand-blue hover:underline font-medium">
          Все {label.toLowerCase()} в Краснодаре <Icon name="ArrowRight" size={14} />
        </Link>
        {districtSlug && districtName && (
          <Link to="/district/$district" params={{ district: districtSlug }} className="inline-flex items-center gap-1 text-brand-blue hover:underline font-medium">
            Коммерческая недвижимость: {districtName} <Icon name="ArrowRight" size={14} />
          </Link>
        )}
      </div>
    </section>
  );
}
