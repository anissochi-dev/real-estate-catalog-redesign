import { Link } from 'react-router-dom';
import Icon from '@/components/ui/icon';

export interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  items: Crumb[];
  light?: boolean;
}

export default function Breadcrumbs({ items, light }: Props) {
  return (
    <nav aria-label="breadcrumb" className="text-sm">
      <ol className={`flex flex-wrap items-center gap-1.5 ${light ? 'text-white/70' : 'text-muted-foreground'}`}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && <Icon name="ChevronRight" size={12} className="opacity-60" />}
              {last || !c.to ? (
                <span className={last ? `font-medium truncate max-w-[260px] ${light ? 'text-white' : 'text-foreground'}` : ''}>{c.label}</span>
              ) : (
                <Link to={c.to} className={`transition-colors ${light ? 'hover:text-white' : 'hover:text-brand-blue'}`}>{c.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}