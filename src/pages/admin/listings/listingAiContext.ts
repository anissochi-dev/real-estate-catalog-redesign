import { Listing, CATS, ROAD_LINES } from './types';

// Собирает все заполненные поля объекта в текст для ИИ.
// Пустые поля пропускаются. Цену для описания НЕ передаём (по требованию).
export function buildListingContext(e: Partial<Listing>, includePrice: boolean): string {
  // Тип сделки: 'business' («готовый бизнес») в проекте неактуален — не выбирается
  // ни в одном интерфейсе (только sale/rent), поэтому явно не обрабатывается,
  // как и раньше по умолчанию попадает в ветку «Продажа».
  const dealLabel = e.deal === 'rent' ? 'Аренда (сдаю, сдаётся)' : 'Продажа (продам, продаю)';
  const parkingLabel: Record<string, string> = { none: 'нет', street: 'на улице', building: 'в здании' };
  // Категорию передаём человекочитаемым русским названием (по словарю CATS),
  // а не техническим кодом из БД — иначе код (например "free_purpose", "gab")
  // может дословно попасть в текст, сгенерированный ИИ.
  const categoryLabel = CATS.find(c => c[0] === e.category)?.[1] || e.category;
  const parts: string[] = [];
  if (e.deal) parts.push(`Тип сделки: ${dealLabel}`);
  if (e.category) parts.push(`Категория: ${categoryLabel}`);
  if (e.city) parts.push(`Город: ${e.city}`);
  if (e.district) parts.push(`Район: ${e.district}`);
  if (e.address) parts.push(`Адрес: ${e.address}`);
  if (e.area) parts.push(`Площадь: ${e.area} м²`);
  if (e.land_area) parts.push(`Площадь участка: ${e.land_area} сот.`);
  if (e.floor) parts.push(`Этаж: ${e.floor}${e.total_floors ? ` из ${e.total_floors}` : ''}`);
  if (e.ceiling_height) parts.push(`Высота потолков: ${e.ceiling_height} м`);
  if (e.condition) parts.push(`Состояние: ${e.condition}`);
  if (e.finishing) parts.push(`Отделка: ${e.finishing}`);
  if (e.electricity_kw) parts.push(`Электричество: ${e.electricity_kw} кВт`);
  if (e.utilities) parts.push(`Коммуникации: ${e.utilities}`);
  if (e.parking) parts.push(`Парковка: ${parkingLabel[e.parking] || e.parking}`);
  if (e.road_line) parts.push(`Линия расположения: ${ROAD_LINES.find(r => r[0] === e.road_line)?.[1] || e.road_line}`);
  if (e.purpose) parts.push(`Назначение (направления использования): ${e.purpose}`);
  // Доходность — важно для аренды/готового бизнеса
  if (e.monthly_rent) parts.push(`Доход в месяц: ${e.monthly_rent} ₽`);
  if (e.yearly_rent) parts.push(`Доход в год: ${e.yearly_rent} ₽`);
  if (e.profit) parts.push(`Чистая прибыль: ${e.profit} ₽`);
  if (e.payback) parts.push(`Окупаемость: ${e.payback} мес.`);
  if (e.deposit_amount) parts.push(`Залог: ${e.deposit_amount} ₽`);
  // Действующий арендатор — вместе с monthly_rent/yearly_rent триггерит блок
  // «Финансовые перспективы и доходность» в промпте generate-описания
  if (e.tenant_name) parts.push(`Действующий арендатор: ${e.tenant_name}`);
  if (e.rented_out) parts.push(`Помещение уже сдано в аренду`);
  if (e.contract_end_date) parts.push(`Договор аренды действует до: ${e.contract_end_date}`);
  if (includePrice && e.price) parts.push(`Цена: ${e.price} ₽`);
  if (e.ai_notes) parts.push(`Особые пожелания к описанию (обязательно учесть): ${e.ai_notes}`);
  return parts.join('; ');
}

// Проверка обязательных полей перед генерацией ИИ
export function checkRequiredForAi(e: Partial<Listing>): string | null {
  const missing: string[] = [];
  if (!e.deal) missing.push('Тип сделки');
  if (!e.category) missing.push('Категория объекта');
  if (!e.address && !e.district) missing.push('Адрес или район');
  if (!e.area) missing.push('Площадь');
  if (missing.length > 0) {
    return `Для генерации ИИ необходимо заполнить:\n• ${missing.join('\n• ')}`;
  }
  return null;
}

// Единый текст-запрос для генерации тегов (кнопка «Теги», «Сгенерировать всё», создание объекта)
export function buildTagsContext(e: Partial<Listing>, description: string): string {
  return `Название: ${e.title}, категория: ${e.category}, назначение: ${e.purpose || ''}, состояние: ${e.condition || ''}, парковка: ${e.parking || ''}, описание: ${description}`;
}

// Единый текст-запрос для SEO-заголовка (кнопка «SEO Title», «Сгенерировать всё», создание объекта)
export function buildSeoContext(e: Partial<Listing>, description: string): string {
  const dealLabel = e.deal === 'rent' ? 'аренда' : e.deal === 'business' ? 'готовый бизнес' : 'продажа';
  return `Название: ${e.title || ''}. Тип: ${e.category || ''}. Сделка: ${dealLabel}. Город: ${e.city || 'Краснодар'}. Район: ${e.district || ''}. Адрес: ${e.address || ''}. Площадь: ${e.area || 0} м². Цена: ${e.price || 0} ₽. Описание: ${description}`;
}

export function parseTags(text: string): string {
  return (text || '').replace(/\n/g, ',').replace(/\s+,/g, ',');
}

export function parseSeoTitle(text: string): string {
  const titleMatch = (text || '').match(/TITLE:\s*(.+)/i);
  return (titleMatch ? titleMatch[1] : '').trim().replace(/^["«]|["»]$/g, '');
}

// Название объекта от ИИ: первая строка, без кавычек и запятых, не длиннее 70 символов по границе слова
export function normalizeAiTitle(raw: string): string {
  let title = (raw || '').split('\n')[0].trim().replace(/^["«]|["»]$/g, '');
  title = title.replace(/\s*,\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (title.length > 70) {
    const cut = title.slice(0, 70);
    const lastSpace = cut.lastIndexOf(' ');
    title = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return title;
}

// Генерация H1-H5 из данных объекта (без ИИ, по шаблону)
export function buildSeoHeadings(e: Partial<Listing>) {
  const DEAL: Record<string, string> = { sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес' };
  const TYPE: Record<string, string> = {
    office: 'офиса', retail: 'торгового помещения', warehouse: 'склада',
    restaurant: 'помещения под общепит', hotel: 'гостиницы', business: 'готового бизнеса',
    gab: 'готового арендного бизнеса', production: 'производственного помещения',
    land: 'земельного участка', building: 'здания', free_purpose: 'помещения',
    car_service: 'помещения под автосервис',
  };
  const city = e.city || 'Краснодар';
  const deal = DEAL[e.deal || ''] || 'Аренда';
  const type = TYPE[e.category || ''] || 'объекта';
  const area = e.area ? `${e.area} м²` : '';
  const addr = e.district || e.address || city;
  const price = e.price ? `${(e.price / 1_000_000).toFixed(e.price >= 10_000_000 ? 0 : 1)} млн ₽` : '';
  return {
    h1: e.title || `${deal} ${type} в ${city}`,
    h2: [deal, type, area, `в ${city}`].filter(Boolean).join(' '),
    h3: addr ? `${deal} ${type} — ${addr}` : `${deal} ${type} в ${city}`,
    h4: [area, price].filter(Boolean).join(' · ') || `Параметры ${type}`,
    h5: price ? `Стоимость: ${price}` : `Цена по запросу — ${city}`,
  };
}
