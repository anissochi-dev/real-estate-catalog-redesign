import { useState, ReactNode } from 'react';
import Icon from '@/components/ui/icon';

interface ExpandableTextProps {
  children: ReactNode;
  collapsedHeight?: number;
}

/** Сворачивает длинный текстовый блок (например SEO-текст) до заданной высоты
 * с градиентом-затемнением снизу и кнопкой «Развернуть» — вместо того чтобы
 * пугать пользователя полотном текста сразу на всю высоту. */
export default function ExpandableText({ children, collapsedHeight = 110 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: expanded ? '2000px' : `${collapsedHeight}px` }}
      >
        {children}
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"
      >
        {expanded ? 'Свернуть' : 'Развернуть'}
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
      </button>
    </div>
  );
}
