/** Подпись фото объекта для поиска по картинкам: «Название, адрес — фото N» (до 125 знаков).
 *  Одна функция для галереи, полноэкранного просмотра и разметки — подписи везде одинаковые. */
export function photoAlt(item: { title?: string; address?: string; city?: string }, index: number): string {
  const name = (item.title || 'Объект').replace(/\s+/g, ' ').trim().replace(/[\s.,;:!-]+$/, '');
  const city = item.city || 'Краснодар';
  const addr = (item.address || '').replace(/\s+/g, ' ').trim();
  const place = addr ? (addr.toLowerCase().includes(city.toLowerCase()) ? addr : `${addr}, ${city}`) : city;
  const suffix = ` — фото ${index + 1}`;
  const base = `${name}, ${place}`;
  const max = 125 - suffix.length;
  return (base.length > max ? base.slice(0, max - 1).trimEnd() + '…' : base) + suffix;
}
