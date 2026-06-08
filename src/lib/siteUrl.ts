/** Возвращает корневой URL сайта из настроек (без trailing slash).
 *  Fallback: window.location.origin. Никогда не хардкодим домен. v2 */
export function getSiteUrl(siteUrlSetting?: string): string {
  const from = (siteUrlSetting || '').replace(/\/$/, '');
  if (from) return from;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}