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

const DEAL_SUFFIX: Record<string, string> = {
  sale: 'на продажу',
  rent: 'в аренду',
  business: 'готовый бизнес',
};

interface Group {
  key: string;
  category: string;
  deal: string;
  items: Property[];
  minArea: number;
  minPrice: number;
}

function groupListings(items: Property[]): Group[] {
  const map = new Map<string, Group>();
  for (const p of items) {
    const key = `${p.type}__${p.deal}`;
    let g = map.get(key);
    if (!g) {
      g = { key, category: p.type, deal: p.deal, items: [], minArea: Infinity, minPrice: Infinity };
      map.set(key, g);
    }
    g.items.push(p);
    if (p.area && p.area < g.minArea) g.minArea = p.area;
    if (p.price && p.price < g.minPrice) g.minPrice = p.price;
  }
  return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
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

  const groups = groupListings(items);

  return (
    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
      <h2 className="font-display font-700 text-base mb-3 flex items-center gap-2">
        <Icon name="Building2" size={16} className="text-brand-blue" />
        Другие предложения по этому адресу
      </h2>

      <div className="divide-y divide-border">
        {groups.map(g => (
          <div key={g.key} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-semibold text-foreground">
                {TYPE_LABELS[g.category] || g.category} {DEAL_SUFFIX[g.deal] || ''}
              </span>
              {Number.isFinite(g.minArea) && (
                <span className="text-muted-foreground text-xs">от {g.minArea.toLocaleString('ru')} м²</span>
              )}
              {Number.isFinite(g.minPrice) && (
                <span className="text-muted-foreground text-xs">от {formatPrice(g.minPrice, g.deal)}</span>
              )}
              <span className="ml-auto text-xs text-brand-blue font-medium">
                {g.items.length} {g.items.length === 1 ? 'объявление' : g.items.length < 5 ? 'объявления' : 'объявлений'}
              </span>
            </div>

            <div className="mt-2 divide-y divide-border/60">
              {g.items.map(p => (
                <Link
                  key={p.id}
                  to={`/object/${listingSlug(p.title, p.id)}`}
                  className="flex items-center gap-3 py-2 hover:bg-muted/40 -mx-1 px-1 rounded-lg transition-colors group"
                >
                  <span className="text-brand-blue text-sm font-medium group-hover:underline underline-offset-2 flex-shrink-0">
                    {TYPE_LABELS[p.type] || p.type}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {p.floor ? `${p.floor} эт.` : ''}
                  </span>
                  <span className="ml-auto text-sm text-muted-foreground flex-shrink-0">
                    {p.area ? `${p.area.toLocaleString('ru')} м²` : ''}
                  </span>
                  <span className="text-sm font-semibold text-foreground flex-shrink-0 w-28 text-right">
                    {formatPrice(p.price, p.deal)}
                  </span>
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted flex-shrink-0">
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
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
