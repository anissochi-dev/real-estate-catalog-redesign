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
  /** Телефон брокера (админка) — используется, если не передан contact_phone. */
  broker_phone?: string | null;
  broker_name?: string | null;
  /** Явно переданный контактный телефон (например, телефон компании — для сайта). Имеет приоритет над broker_phone. */
  contact_phone?: string | null;
  contact_name?: string | null;
}

const MAX_LENGTH = 300;

/**
 * Собирает текст-подпись для отправки объекта в мессенджеры вместе с JPG-презентацией.
 * Формат: название → адрес → телефон → площадь/цена → описание.
 * Итоговый текст ограничен 300 символами — описание обрезается по необходимости.
 */
export function buildShareListingText(listing: ShareListingInput): string {
  const lines: string[] = [];

  if (listing.title?.trim()) lines.push(listing.title.trim());

  const cityLine = [listing.city, listing.address].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);

  const phone = listing.contact_phone || listing.broker_phone;
  const phoneName = listing.contact_phone ? listing.contact_name : listing.broker_name;
  if (phone) {
    const phoneLine = [formatPhone(phone), phoneName].filter(Boolean).join(' ');
    lines.push('', phoneLine);
  }

  const details: string[] = [];
  if (listing.area) details.push(`Площадь ${listing.area} м²`);
  if (listing.price) details.push(`Цена ${formatPrice(listing.price, listing.deal || 'sale')}`);
  if (details.length) lines.push('', details.join('\n'));

  const headPart = lines.join('\n');
  const description = listing.description?.trim() || '';

  if (!description) return headPart.slice(0, MAX_LENGTH);

  // Считаем, сколько места остаётся под описание с учётом разделителя '\n\n'
  const budget = MAX_LENGTH - headPart.length - 2;
  if (budget <= 0) return headPart.slice(0, MAX_LENGTH);

  const trimmedDescription = description.length > budget
    ? description.slice(0, Math.max(budget - 1, 0)).trimEnd() + '…'
    : description;

  return [headPart, trimmedDescription].join('\n\n');
}