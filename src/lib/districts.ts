import { District } from '@/lib/api';

export interface OkrugGroup {
  okrug: District;
  children: District[];
  total: number;
}

const byCount = (a: District, b: District) =>
  (b.listings_count ?? 0) - (a.listings_count ?? 0);

const bySort = (a: District, b: District) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru');

/**
 * Группирует районы в иерархию: округа → их дочерние районы.
 * @param districts полный список из fetchDistricts()
 * @param opts.onlyWithListings оставлять только районы/округа, где есть объекты
 * @param opts.sortBy 'count' — по числу объектов, 'order' — по sort_order
 */
export function groupByOkrug(
  districts: District[],
  opts: { onlyWithListings?: boolean; sortBy?: 'count' | 'order' } = {},
): { groups: OkrugGroup[]; orphans: District[] } {
  const { onlyWithListings = false, sortBy = 'order' } = opts;
  const sorter = sortBy === 'count' ? byCount : bySort;
  const hasListings = (d: District) => (d.listings_count ?? 0) > 0;

  const groups = districts
    .filter(o => o.is_okrug)
    .map(o => {
      let children = districts.filter(d => !d.is_okrug && d.parent_id === o.id);
      if (onlyWithListings) children = children.filter(hasListings);
      children = [...children].sort(sorter);
      const total = children.reduce((s, d) => s + (d.listings_count ?? 0), 0);
      return { okrug: o, children, total };
    })
    .filter(g => (onlyWithListings ? g.children.length > 0 : true));

  groups.sort((a, b) =>
    sortBy === 'count' ? b.total - a.total : bySort(a.okrug, b.okrug),
  );

  let orphans = districts.filter(d => !d.is_okrug && d.parent_id == null);
  if (onlyWithListings) orphans = orphans.filter(hasListings);
  orphans = [...orphans].sort(sorter);

  return { groups, orphans };
}

/** Названия районов, входящих в округ (для фильтрации объектов). */
export function getOkrugChildNames(districts: District[], okrug: District): string[] {
  return districts
    .filter(d => !d.is_okrug && d.parent_id === okrug.id)
    .map(d => d.name);
}

/** Подходит ли объект под выбранный район/округ по списку названий районов. */
export function matchesDistrictNames(
  district: string | undefined,
  address: string | undefined,
  names: string[],
): boolean {
  const d = (district || '').toLowerCase();
  const a = (address || '').toLowerCase();
  return names.some(n => {
    const nl = n.toLowerCase();
    return d.includes(nl) || a.includes(nl);
  });
}
