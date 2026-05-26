/** Приводит строку к цифрам, убирая +7 / 8 в начале */
export function extractDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('7') || d.startsWith('8')) return d.slice(1);
  return d;
}

/** Форматирует в +7 XXX XXX-XX-XX */
export function formatPhone(raw: string): string {
  const d = extractDigits(raw).slice(0, 10);
  if (!d) return '';
  let r = '+7 ';
  if (d.length <= 3) return r + d;
  r += d.slice(0, 3);
  if (d.length <= 6) return r + ' ' + d.slice(3);
  r += ' ' + d.slice(3, 6);
  if (d.length <= 8) return r + '-' + d.slice(6);
  r += '-' + d.slice(6, 8);
  if (d.length > 8) r += '-' + d.slice(8, 10);
  return r;
}

/** Нормализует в хранимый формат +7XXXXXXXXXX */
export function normalizePhone(raw: string): string {
  const d = extractDigits(raw).slice(0, 10);
  if (!d) return '';
  return '+7' + d;
}

/** Проверяет — введён ли полный номер (10 цифр после +7) */
export function isPhoneComplete(raw: string): boolean {
  return extractDigits(raw).length === 10;
}

/**
 * Обрабатывает onChange в input типа tel:
 * принимает rawInput из e.target.value,
 * возвращает нормализованную строку для хранения
 */
export function parsePhoneInput(rawInput: string): string {
  return normalizePhone(rawInput);
}
