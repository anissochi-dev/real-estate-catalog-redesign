import { Listing } from './types';

export const DEAL_LABELS: Record<string, string> = { sale: 'продажа', rent: 'аренда', business: 'готовый бизнес' };
export const CAT_LABELS: Record<string, string> = {
  office: 'офис', retail: 'торговое помещение', warehouse: 'склад',
  restaurant: 'кафе/ресторан', hotel: 'гостиница', business: 'готовый бизнес',
  gab: 'ГАБ', production: 'производство', free_purpose: 'свободного назначения',
  land: 'земельный участок', building: 'здание', car_service: 'автосервис',
};
export const COND_LABELS: Record<string, string> = {
  new: 'новое', euro: 'евроремонт', designer: 'дизайнерский ремонт',
  good: 'хорошее', normal: 'рабочее', needs_repair: 'требует ремонта',
  rough: 'черновая отделка', shell: 'без отделки',
};

export function buildAutoPrompt(listing: Listing, marketData?: { median?: number; min?: number; max?: number; analogs?: number }): string {
  const deal = DEAL_LABELS[listing.deal] || listing.deal;
  const cat = CAT_LABELS[listing.category] || listing.category;
  const cond = COND_LABELS[listing.condition || ''] || listing.condition || 'не указано';
  const addr = [listing.address, listing.district, listing.city].filter(Boolean).join(', ') || 'не указан';

  const comms: string[] = [];
  if (listing.electricity_kw) comms.push(`электричество ${listing.electricity_kw} кВт`);
  if (listing.utilities) comms.push(listing.utilities);
  const commsStr = comms.length ? comms.join(', ') : 'не указаны';

  const income = listing.monthly_rent
    ? `${listing.monthly_rent.toLocaleString('ru')} руб./мес.`
    : listing.yearly_rent
    ? `${listing.yearly_rent.toLocaleString('ru')} руб./год`
    : listing.profit
    ? `${listing.profit.toLocaleString('ru')} руб./мес.`
    : 'нет данных';

  const marketLine = marketData?.median
    ? `- Средняя цена аналогичных объектов: ${marketData.median.toLocaleString('ru')} руб.\n- Количество аналогичных предложений: ${marketData.analogs ?? 'н/д'}\n- Диапазон рынка: ${(marketData.min ?? 0).toLocaleString('ru')} – ${(marketData.max ?? 0).toLocaleString('ru')} руб.`
    : '- Данные рынка: недостаточно аналогов для точного анализа';

  return `Ты — эксперт по коммерческой недвижимости с 15‑летним опытом. Твоя задача — проанализировать объект и дать развёрнутые рекомендации.

ДАННЫЕ ОБ ОБЪЕКТЕ:
- Категория: ${deal}
- Тип: ${cat}
- Адрес: ${addr}
- Площадь: ${listing.area || '—'} м²
- Этаж: ${listing.floor ?? 'не указан'}${listing.total_floors ? ` из ${listing.total_floors}` : ''}
- Состояние: ${cond}
- Коммуникации: ${commsStr}
- Мощность электроэнергии: ${listing.electricity_kw ? `${listing.electricity_kw} кВт` : 'не указана'}
- Арендатор: ${listing.tenant_name ? `есть (${listing.tenant_name})` : 'нет'}
- Доход: ${income}
- Цена/ставка: ${listing.price ? `${listing.price.toLocaleString('ru')} руб.` : 'не указана'}
- Фото: ${listing.images ? 'есть' : 'нет'}

ДАННЫЕ ИЗ АНАЛИЗА РЫНКА:
${marketLine}
- Ликвидность (среднее время продажи/аренды): зависит от категории и района
- Инфраструктура рядом: определяется по адресу объекта
- Планы развития района: требует отдельного анализа

ЗАДАНИЯ:
1. Сравни цену объекта со среднерыночной. Укажи, завышена она или занижена, на сколько процентов.
2. Оцени ликвидность объекта на основе данных рынка.
3. Проанализируй инфраструктуру и планы развития района. Как это влияет на привлекательность объекта?
4. Дай рекомендации брокеру: что можно улучшить в презентации объекта? Какие акценты сделать в описании?
5. Предложи 2–3 идеи по улучшению самого объекта (ремонт, перепланировка, дополнительные услуги и т. д.).
6. Сформулируй УТП для названия объекта (5–7 вариантов, до 10 слов каждый).
7. Напиши продающее описание объекта по шаблону:
   - Начало: «От собственника, без % и комиссий!»
   - Далее — краткий анализ преимуществ на основе данных выше.
   - Затем — рекомендации по улучшению.
   - В конце — перспективы объекта (для кого подойдёт, какие направления бизнеса).
   - Объём: 200–300 слов. Стиль: деловой, но живой, без канцелярита. Избегай списков и таблиц. Пиши сплошным текстом с абзацами.

ОТВЕТ ДАЙ ТОЛЬКО В ВИДЕ ГОТОВОГО ОПИСАНИЯ ОБЪЕКТА ПО ШАБЛОНУ. НЕ ВКЛЮЧАЙ ПРОМЕЖУТОЧНЫЕ ВЫВОДЫ ИЛИ РАЗДЕЛЫ.`;
}
