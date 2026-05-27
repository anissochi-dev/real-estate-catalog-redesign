import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Property } from '@/App';
import { listingSlug } from '@/lib/slug';
import { formatPrice } from '@/lib/formatPrice';
import Icon from '@/components/ui/icon';

const STORAGE_KEY = 'recently_viewed';
const MAX_STORED = 50;
const SHOW_DEFAULT = 10;

export function recordView(property: Property) {
  try {
    const stored = getRecentlyViewed();
    const filtered = stored.filter(p => p.id !== property.id);
    const updated = [property, ...filtered].slice(0, MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

export function getRecentlyViewed(): Property[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

interface Props {
  currentId?: number;
}

export default function RecentlyViewed({ currentId }: Props) {
  const [items, setItems] = useState<Property[]>([]);
  const [showAll, setShowAll] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const all = getRecentlyViewed().filter(p => p.id !== currentId);
    setItems(all);
  }, [currentId]);

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const visible = showAll ? items : items.slice(0, SHOW_DEFAULT);

  if (!items.length) return null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Clock" size={18} className="text-muted-foreground" />
          Вы смотрели
          <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {!showAll && items.length > SHOW_DEFAULT && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-brand-blue hover:underline font-medium"
            >
              Все просмотренные →
            </button>
          )}
          {showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              Свернуть
            </button>
          )}
          {!showAll && (
            <>
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
            </>
          )}
        </div>
      </div>

      {showAll ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visible.map(p => (
            <RecentCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-smooth"
          style={{ scrollbarWidth: 'thin' }}
        >
          {visible.map(p => (
            <RecentCard key={p.id} p={p} carousel />
          ))}
        </div>
      )}

      {!showAll && items.length > SHOW_DEFAULT && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-brand-blue transition-colors py-1"
        >
          Показать все {items.length} просмотренных объектов
        </button>
      )}
    </div>
  );
}

function RecentCard({ p, carousel }: { p: Property; carousel?: boolean }) {
  return (
    <Link
      to={`/object/${listingSlug(p.title, p.id)}`}
      className={`snap-start flex-shrink-0 rounded-xl border border-border bg-white hover:shadow-md transition-shadow overflow-hidden group ${
        carousel ? 'w-[220px]' : 'w-full'
      }`}
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
            <Icon name="Image" size={28} className="text-muted-foreground" />
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
  );
}