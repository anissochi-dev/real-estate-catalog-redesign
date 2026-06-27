/** Форматирует ID объекта: ДДММГГ + числовой id.
 *  id=132, createdAt="2026-06-27" → "270626132" */
export function fmtListingId(id: number, createdAt?: string): string {
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(2);
      return `${dd}${mm}${yy}${id}`;
    }
  }
  return `${id}`;
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