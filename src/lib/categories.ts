// Единый источник категорий каталога: порядок, названия, иконки и ссылки.
// Используется в подвале, на главной, в хлебных крошках и фильтрах,
// чтобы навигация по категориям везде была одинаковой.

export interface CatalogCategory {
  type: string;
  /** Название для навигации/подвала/главной (множественное число). */
  label: string;
  /** Короткое название для бейджей/фильтров. */
  short: string;
  icon: string;
  gradient: string;
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { type: 'office',       label: 'Офисы',                         short: 'Офис',                  icon: 'Building2',       gradient: 'from-blue-500 to-indigo-600' },
  { type: 'retail',       label: 'Магазин, торговое помещение',   short: 'Торговое',              icon: 'ShoppingBag',     gradient: 'from-orange-500 to-rose-500' },
  { type: 'warehouse',    label: 'Склады',                        short: 'Склад',                 icon: 'Warehouse',       gradient: 'from-slate-500 to-zinc-700' },
  { type: 'restaurant',   label: 'Общепит, кафе, ресторан',       short: 'Общепит',               icon: 'UtensilsCrossed', gradient: 'from-amber-500 to-red-500' },
  { type: 'hotel',        label: 'Гостиницы',                     short: 'Гостиница',             icon: 'BedDouble',       gradient: 'from-pink-500 to-fuchsia-600' },
  { type: 'business',     label: 'Готовый бизнес',                short: 'Готовый бизнес',        icon: 'Briefcase',       gradient: 'from-violet-500 to-purple-700' },
  { type: 'gab',          label: 'Готовый арендный бизнес (ГАБ)', short: 'ГАБ',                   icon: 'TrendingUp',      gradient: 'from-emerald-500 to-teal-600' },
  { type: 'production',   label: 'Производственные помещения',     short: 'Производство',          icon: 'Factory',         gradient: 'from-stone-500 to-neutral-700' },
  { type: 'land',         label: 'Земельные участки',             short: 'Земля',                 icon: 'Trees',           gradient: 'from-lime-500 to-green-700' },
  { type: 'building',     label: 'Отдельно стоящие здания',       short: 'Здание',                icon: 'Landmark',        gradient: 'from-sky-500 to-blue-700' },
  { type: 'free_purpose', label: 'Свободное назначение',          short: 'Своб. назначение',      icon: 'Shuffle',         gradient: 'from-cyan-500 to-teal-700' },
  { type: 'car_service',  label: 'Автосервисы',                   short: 'Автосервис',            icon: 'Wrench',          gradient: 'from-zinc-500 to-slate-800' },
];

const BY_TYPE: Record<string, CatalogCategory> = Object.fromEntries(
  CATALOG_CATEGORIES.map(c => [c.type, c]),
);

/** Канонический URL страницы категории. */
export function catalogCategoryUrl(type: string): string {
  return `/catalog/${type}`;
}

/** Название категории (множественное) или сам type, если не найдено. */
export function categoryLabel(type: string): string {
  return BY_TYPE[type]?.label ?? type;
}

/** Короткое название категории для бейджей. */
export function categoryShortLabel(type: string): string {
  return BY_TYPE[type]?.short ?? type;
}

export function getCategory(type: string): CatalogCategory | undefined {
  return BY_TYPE[type];
}
