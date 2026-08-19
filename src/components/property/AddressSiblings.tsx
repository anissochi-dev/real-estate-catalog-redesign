import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Property } from '@/App';
import { fetchSameAddressListings } from '@/lib/api';
import { listingSlug } from '@/lib/slug';
import { formatPrice } from '@/components/PropertyCard';
import { TYPE_LABELS } from '@/components/property/propertyLabels';
import Icon from '@/components/ui/icon';

interface Props {
  listingId: number;
}

export default function AddressSiblings({ listingId }: Props) {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSameAddressListings(listingId)
      .then(list => { if (alive) setItems(list); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [listingId]);

  if (loading || !items.length) return null;

  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return (TYPE_LABELS[a.type] || a.type).localeCompare(TYPE_LABELS[b.type] || b.type, 'ru');
    return (a.price || 0) - (b.price || 0);
  });

  return (
    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
      <h2 className="font-display font-700 text-base mb-3 flex items-center gap-2">
        <Icon name="Building2" size={16} className="text-brand-blue" />
        Другие предложения по этому адресу
      </h2>

      <div className="divide-y divide-border/60">
        {sorted.map(p => (
          <Link
            key={p.id}
            to={`/object/${listingSlug(p.title, p.id)}`}
            className="flex items-center gap-3 py-2.5 hover:bg-muted/40 -mx-1 px-1 rounded-lg transition-colors group"
          >
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {p.image ? (
                <img
                  src={p.image_thumb || p.image}
                  alt={p.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon name="Image" size={16} className="text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-shrink-0">
              <div className="text-brand-blue text-sm font-medium group-hover:underline underline-offset-2 truncate">
                {TYPE_LABELS[p.type] || p.type}
              </div>
              {p.floor ? (
                <div className="text-xs text-muted-foreground">{p.floor} эт.</div>
              ) : null}
            </div>

            <span className="ml-auto text-sm text-muted-foreground flex-shrink-0 whitespace-nowrap">
              {p.area ? `${p.area.toLocaleString('ru')} м²` : ''}
            </span>
            <span className="text-sm font-semibold text-foreground flex-shrink-0 whitespace-nowrap min-w-[6.5rem] text-right">
              {formatPrice(p.price, p.deal)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
