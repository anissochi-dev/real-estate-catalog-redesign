import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Property } from '@/App';
import { fetchSimilarListings } from '@/lib/api';
import { listingSlug } from '@/lib/slug';
import { formatPrice } from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';

interface Props {
  listingId: number;
}

export default function SimilarListings({ listingId }: Props) {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSimilarListings(listingId)
      .then(list => { if (alive) setItems(list); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [listingId]);

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="font-display font-700 text-lg mb-3">Похожие объекты</div>
        <div className="text-sm text-muted-foreground">Подбираем варианты...</div>
      </div>
    );
  }
  if (!items.length) return null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="LayoutGrid" size={18} />
          Похожие объекты
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Назад"
            className="w-9 h-9 rounded-full border border-border bg-white hover:bg-muted flex items-center justify-center"
          >
            <Icon name="ChevronLeft" size={16} />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Вперёд"
            className="w-9 h-9 rounded-full border border-border bg-white hover:bg-muted flex items-center justify-center"
          >
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.map(p => (
          <Link
            key={p.id}
            to={`/object/${listingSlug(p.title, p.id)}`}
            className="snap-start flex-shrink-0 w-[260px] rounded-xl border border-border bg-white hover:shadow-md transition-shadow overflow-hidden group"
          >
            <div className="aspect-[16/10] bg-muted overflow-hidden">
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon name="Image" size={32} className="text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="p-3 space-y-1">
              <div className="font-display font-700 text-sm line-clamp-2 min-h-[2.5em] text-foreground">
                {p.title}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                <Icon name="MapPin" size={11} />
                {[p.district, p.address].filter(Boolean).join(', ') || '—'}
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="font-display font-800 text-brand-blue text-sm">
                  {formatPrice(p.price, p.deal)}
                </div>
                <div className="text-[11px] text-muted-foreground">{p.area} м²</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}