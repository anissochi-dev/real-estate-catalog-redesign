import { formatPrice } from '@/lib/formatPrice';
import { formatPhone } from '@/lib/phone';

interface ShareListingInput {
  title?: string | null;
  city?: string | null;
  address?: string | null;
  description?: string | null;
  area?: number | null;
  price?: number | null;
  deal?: string | null;
  broker_phone?: string | null;
  broker_name?: string | null;
}

/**
 * Собирает текст-подпись для отправки объекта в мессенджеры вместе с JPG-презентацией.
 * Формат: название → адрес → телефон брокера → площадь/цена → описание.
 * Данные всегда актуальные — берутся из уже открытой карточки объекта в админке.
 */
export function buildShareListingText(listing: ShareListingInput): string {
  const lines: string[] = [];

  if (listing.title?.trim()) lines.push(listing.title.trim());

  const cityLine = [listing.city, listing.address].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);

  if (listing.broker_phone) {
    const phoneLine = [formatPhone(listing.broker_phone), listing.broker_name].filter(Boolean).join(' ');
    lines.push('', phoneLine);
  }

  const details: string[] = [];
  if (listing.area) details.push(`Площадь ${listing.area} м²`);
  if (listing.price) details.push(`Цена ${formatPrice(listing.price, listing.deal || 'sale')}`);
  if (details.length) lines.push('', details.join('\n'));

  if (listing.description?.trim()) lines.push('', listing.description.trim());

  return lines.join('\n');
}