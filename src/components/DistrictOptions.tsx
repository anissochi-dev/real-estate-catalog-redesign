import { District } from '@/lib/api';

interface DistrictOptionsProps {
  districts: District[];
}

function optionLabel(d: District): string {
  return `${d.name}${d.listings_count ? ` (${d.listings_count})` : ''}`;
}

/**
 * Рендерит опции для <select> района с иерархией:
 * сначала округа (как заголовки <optgroup>), под ними — вложенные районы.
 * Районы без округа выводятся в группе «Другие районы».
 * Используется вместе с <option value="all">Все районы</option> в родителе.
 */
export default function DistrictOptions({ districts }: DistrictOptionsProps) {
  const okrugs = districts
    .filter(d => d.is_okrug)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'));

  const childrenOf = (okrugId: number) =>
    districts
      .filter(d => !d.is_okrug && d.parent_id === okrugId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'));

  const orphans = districts
    .filter(d => !d.is_okrug && (d.parent_id == null))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'));

  // Если иерархия не задана (нет округов) — плоский список как раньше
  if (okrugs.length === 0) {
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
      {okrugs.map(o => {
        const kids = childrenOf(o.id);
        if (kids.length === 0) return null;
        return (
          <optgroup key={o.id} label={o.name}>
            {kids.map(d => (
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
