import { formatPhone } from '@/lib/phone';

export interface SocialPostListing {
  id?: number;
  title?: string | null;
  category?: string | null;
  deal?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  area?: number | null;
  land_area?: number | null;
  floor?: number | null;
  total_floors?: number | null;
  rooms?: number | null;
  ceiling_height?: number | null;
  electricity_kw?: number | string | null;
  utilities?: string | null;
  purpose?: string | null;
  condition?: string | null;
  parking?: string | null;
  price?: number | null;
  price_unit?: string | null;
}

export interface SocialPostCompany {
  phone?: string | null;
  nick?: string | null;
  partnerText?: string | null;
}

export const TELEGRAM_CAPTION_LIMIT = 1024;
export const VK_POST_LIMIT = 15895;

const CATEGORY: Record<string, { emoji: string; rent: string; sale: string; word: string }> = {
  restaurant: { emoji: '🍽', rent: 'Аренда помещения под общепит', sale: 'Продажа помещения под общепит', word: 'ОБЩЕПИТ' },
  office: { emoji: '🏢', rent: 'Аренда офиса', sale: 'Продажа офиса', word: 'ОФИС' },
  warehouse: { emoji: '🏭', rent: 'Аренда склада', sale: 'Продажа склада', word: 'СКЛАД' },
  production: { emoji: '🏭', rent: 'Аренда производственного помещения', sale: 'Продажа производственного помещения', word: 'ПРОИЗВОДСТВО' },
  retail: { emoji: '🛍', rent: 'Аренда торгового помещения', sale: 'Продажа торгового помещения', word: 'ТОРГОВЛЯ' },
  free_purpose: { emoji: '🏬', rent: 'Аренда помещения свободного назначения', sale: 'Продажа помещения свободного назначения', word: 'ПОМЕЩЕНИЕ' },
  building: { emoji: '🏛', rent: 'Аренда отдельно стоящего здания', sale: 'Продажа отдельно стоящего здания', word: 'ЗДАНИЕ' },
  land: { emoji: '🌳', rent: 'Аренда земельного участка', sale: 'Продажа земельного участка', word: 'УЧАСТОК' },
  hotel: { emoji: '🏨', rent: 'Аренда гостиницы', sale: 'Продажа гостиницы', word: 'ГОСТИНИЦА' },
  car_service: { emoji: '🔧', rent: 'Аренда автосервиса', sale: 'Продажа автосервиса', word: 'АВТОСЕРВИС' },
  business: { emoji: '💼', rent: 'Аренда готового бизнеса', sale: 'Продажа готового бизнеса', word: 'БИЗНЕС' },
  gab: { emoji: '📈', rent: 'Готовый арендный бизнес', sale: 'Продажа готового арендного бизнеса', word: 'ГАБ' },
};

const nf = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);

function parseUtilities(raw?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  (raw || '').split(',').forEach(part => {
    const i = part.indexOf(':');
    if (i > 0) {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k && v && !/^отсутств/i.test(v)) out[k] = v;
    }
  });
  return out;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function plural(v: string) {
  const l = lower(v);
  if (l.endsWith('ая')) return l.slice(0, -2) + 'ые';
  if (l.endsWith('ое') || l.endsWith('ый') || l.endsWith('ий')) return l.slice(0, -2) + 'ые';
  return l;
}

function priceLine(price: number, deal: string, unit?: string | null) {
  if (unit === 'm2') return deal === 'rent' ? `${nf(price)} ₽/м² в мес` : `${nf(price)} ₽/м²`;
  if (unit === 'sotka') return `${nf(price)} ₽/сотка`;
  return deal === 'rent' ? `${nf(price)} ₽/мес` : `${nf(price)} ₽`;
}

export function buildSocialPostText(l: SocialPostListing, company: SocialPostCompany, link?: string): string {
  const deal = l.deal === 'rent' ? 'rent' : 'sale';
  const cat = CATEGORY[l.category || ''] || { emoji: '🏠', rent: 'Аренда помещения', sale: 'Продажа помещения', word: 'ОБЪЕКТ' };
  const lines: string[] = [];
  const push = (emoji: string, text?: string | null | false) => { if (text) lines.push(`${emoji} ${text}`); };

  push(cat.emoji, cat[deal]);
  if (l.id) push('🆔', `ID объекта — ${l.id}`);
  push('📍', [l.city, l.district].filter(Boolean).join(', ') || l.address);
  if (l.area) push('📐', `Общая площадь — ${nf(Number(l.area))} м²`);
  if (l.land_area && l.category !== 'land') push('🌳', `Участок — ${nf(Number(l.land_area))} сот.`);
  if (l.floor || l.total_floors) {
    push('🏬', l.floor && l.total_floors ? `${l.floor}-й этаж из ${l.total_floors}` : l.floor ? `${l.floor}-й этаж` : `Этажей в здании — ${l.total_floors}`);
  }
  if (l.rooms) push('🚪', `${l.rooms} помещений/зон`);
  if (l.ceiling_height) push('📏', `Потолки — ${nf(Number(l.ceiling_height))} м`);

  const u = parseUtilities(l.utilities);
  const kw = Number(l.electricity_kw) || 0;
  if (kw) push('⚡', `Электроэнергия — ${nf(kw)} кВт`);
  else if (u['Электричество']) push('⚡', `Электричество — ${u['Электричество']}`);
  if (u['Вода'] && u['Канализация'] && lower(u['Вода']).slice(0, 5) === lower(u['Канализация']).slice(0, 5)) {
    push('🚰', `Вода и канализация — ${plural(u['Вода'])}`);
  } else {
    if (u['Вода']) push('🚰', `Вода — ${lower(u['Вода'])}`);
    if (u['Канализация']) push('🚽', `Канализация — ${lower(u['Канализация'])}`);
  }
  if (u['Газ']) push('🔥', `Газ — ${lower(u['Газ']).replace('магистральный', 'сетевой')}`);
  if (u['Отопление']) push('🌡', `Отопление — ${lower(u['Отопление'])}`);
  if (u['Вентиляция']) push('💨', `Вентиляция — ${lower(u['Вентиляция'])}`);
  if (u['Кондиционирование']) push('❄️', `Кондиционирование — ${lower(u['Кондиционирование'])}`);
  if (u['Интернет']) push('🌐', `Интернет — ${lower(u['Интернет'])}`);
  if (u['Видеонаблюдение'] || u['Пожарная сигнализация']) {
    push('🛡', [u['Видеонаблюдение'] && 'видеонаблюдение', u['Пожарная сигнализация'] && 'пожарная сигнализация'].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()));
  }
  if (l.parking) push('🅿️', `Парковка — ${lower(l.parking)}`);

  const purposes = (l.purpose || '').split(/[|,]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (purposes.length) push('✅', `Подойдёт: ${purposes.map(lower).join(', ')}`);

  if (l.price) push('💰', `Стоимость — ${priceLine(Number(l.price), deal, l.price_unit)}`);

  lines.push('');
  push('✉️', `Напишите в ЛС «${cat.word}» — пришлю фото, планировку и организую просмотр`);
  const contact = [company.nick?.trim(), company.phone ? formatPhone(company.phone) : ''].filter(Boolean).join(' / ');
  if (contact) push('📞', `Контакт: ${contact}`);
  if (link) push('🔗', link);
  if (company.partnerText?.trim()) {
    const t = company.partnerText.trim();
    lines.push('', /^\p{Extended_Pictographic}/u.test(t) ? t : `🤝 ${t}`);
  }
  return lines.join('\n');
}
