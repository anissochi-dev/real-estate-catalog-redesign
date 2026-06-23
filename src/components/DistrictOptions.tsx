import { District } from '@/lib/api';
import { groupByOkrug } from '@/lib/districts';

interface DistrictOptionsProps {
  districts: District[];
}

function optionLabel(d: District): string {
  return `${d.name}${d.listings_count ? ` (${d.listings_count})` : ''}`;
}

/**
 * Опции для <select> района с иерархией: округа как <optgroup>,
 * под ними районы. Округ выбирается значением `okrug:<id>` (все его районы).
 * Используется вместе с <option value="all">Все районы</option> в родителе.
 */
export default function DistrictOptions({ districts }: DistrictOptionsProps) {
  const { groups, orphans } = groupByOkrug(districts, { sortBy: 'order' });

  // Если иерархия не задана (нет округов) — плоский список
  if (groups.length === 0) {
    return (
      <>
        {districts
          .filter(d => !d.is_okrug)
          .map(d => (
            <option key={d.id} value={d.name}>{optionLabel(d)}</option>
          ))}
      </>
    );
  }

  return (
    <>
      {groups.map(({ okrug, children, total }) => {
        if (children.length === 0) return null;
        return (
          <optgroup key={okrug.id} label={okrug.name}>
            <option value={`okrug:${okrug.id}`}>Весь {okrug.name}{total ? ` (${total})` : ''}</option>
            {children.map(d => (
              <option key={d.id} value={d.name}>{optionLabel(d)}</option>
            ))}
          </optgroup>
        );
      })}
      {orphans.length > 0 && (
        <optgroup label="Другие районы">
          {orphans.map(d => (
            <option key={d.id} value={d.name}>{optionLabel(d)}</option>
          ))}
        </optgroup>
      )}
    </>
  );
}
