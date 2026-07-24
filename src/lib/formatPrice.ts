/** Форматирует ID объекта: просто числовой id, без даты.
 *  id=132 → "132" */
export function fmtListingId(id: number, _createdAt?: string): string {
  return `${id}`;
}

/** Считает окупаемость в годах для объектов на продажу с арендным доходом.
 *  Возвращает null если сделка не 'sale' или нет данных для расчёта. */
export function computePaybackYears(
  price: number,
  deal: string,
  yearlyRent?: number | null,
  monthlyRent?: number | null,
): number | null {
  if (deal !== 'sale' || !price) return null;
  const yearly = yearlyRent || (monthlyRent ? monthlyRent * 12 : 0);
  if (!yearly) return null;
  return price / yearly;
}

export function formatPrice(price: number, deal: string): string {
  const fmtMln = (v: number) => {
    const n = v / 1000000;
    return Number.isInteger(n) || n % 1 === 0 ? `${n.toFixed(0)}` : `${parseFloat(n.toFixed(1))}`;
  };
  if (deal === 'rent') {
    if (price >= 1000000) return `${fmtMln(price)} млн ₽/мес`;
    return `${(price / 1000).toFixed(0)} тыс ₽/мес`;
  }
  if (price >= 1000000) return `${fmtMln(price)} млн ₽`;
  return `${(price / 1000).toFixed(0)} тыс ₽`;
}