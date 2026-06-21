/**
 * Dynamic Rendering для поисковых ботов (Яндекс, Google и др.)
 *
 * Логика:
 * 1. Определяем по User-Agent, X-Purpose и _escaped_fragment_ — бот это или нет
 * 2. Бот → проксируем на prerender-функцию, которая отдаёт готовый HTML из БД
 * 3. Браузер → пропускаем дальше (→ index.html через _redirects, SPA как обычно)
 *
 * Обрабатываемые страницы:
 * - /object/*     — карточки объектов (главный приоритет)
 * - /catalog/*    — каталог и категории
 * - /district/*   — страницы районов
 * - /news/*       — статьи новостей
 * - /             — главная
 * - /map, /leads, /network-tenants — прочие публичные страницы
 *
 * Страницы /admin, /favorites, /compare — не обрабатываем (noindex).
 */

// URL prerender-функции
const PRERENDER_URL = 'https://functions.poehali.dev/1111ba70-a6c3-4c58-b8b0-2519af14b7ff';

// Боты по User-Agent (регистронезависимо)
const BOT_UA_PATTERN =
  /Yandex|YandexBot|Googlebot|Bingbot|Slurp|DuckDuckBot|facebookexternalhit|Twitterbot|LinkedInBot|TelegramBot|vkShare|WhatsApp|Applebot|Bytespider|PetalBot|SemrushBot|AhrefsBot|MJ12bot|DataForSeoBot/i;

// Пути которые не нужно prerender-ить (закрытые/noindex)
const SKIP_PATHS = /^\/(admin|login|auth|signin|favorites|compare)(\/|$)/;

// Пути которые нужно prerender-ить для ботов
const BOT_PATHS = /^\/(object|catalog|district|news|map|leads|network-tenants)(\/|$)|^\/$/;

// TTL кэша по типу страницы (секунды)
function getCacheTTL(pathname: string): number {
  if (pathname.startsWith('/object/')) return 600;        // 10 мин — цены меняются
  if (pathname.startsWith('/catalog/')) return 900;       // 15 мин — категории
  if (pathname === '/catalog') return 900;
  if (pathname.startsWith('/news/')) return 1800;         // 30 мин — статьи
  if (pathname.startsWith('/district/')) return 1800;     // 30 мин — районы
  return 3600;                                            // 1 час — главная, map, leads
}

// Netlify Edge Function context type
interface Context {
  next: () => Promise<Response>;
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const { pathname } = url;

  // Пропускаем статические ресурсы — js, css, fonts, images, favicon и т.д.
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json|webp|avif|txt|xml)$/i.test(pathname)) {
    return context.next();
  }

  // Пропускаем закрытые пути
  if (SKIP_PATHS.test(pathname)) {
    return context.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  const xPurpose  = request.headers.get('x-purpose') || '';
  const hasEscapedFragment = url.searchParams.has('_escaped_fragment_');

  // Определяем бота:
  // 1. По User-Agent (Yandex, Googlebot и др.)
  // 2. По X-Purpose: preview (Яндекс Вебмастер при проверке страниц — без этого PARSER_ERROR)
  // 3. По параметру _escaped_fragment_ (старый стандарт AJAX-crawling, Яндекс поддерживает)
  const isBot =
    BOT_UA_PATTERN.test(userAgent) ||
    xPurpose === 'preview' ||
    hasEscapedFragment;

  if (!isBot) {
    return context.next();
  }

  // Проверяем что путь нужно prerender-ить
  if (!BOT_PATHS.test(pathname)) {
    return context.next();
  }

  // Формируем запрос к prerender-функции
  const prerenderUrl = new URL(PRERENDER_URL);
  prerenderUrl.searchParams.set('path', pathname);

  try {
    const prerenderResponse = await fetch(prerenderUrl.toString(), {
      headers: {
        'User-Agent': userAgent,
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
        'X-Purpose': xPurpose,
      },
      // Таймаут 8 секунд — если prerender не успел, возвращаем SPA
      signal: AbortSignal.timeout(8000),
    });

    const html = await prerenderResponse.text();
    const status = prerenderResponse.status;
    const ttl = getCacheTTL(pathname);

    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
        'X-Prerendered': '1',
        'X-Prerender-Path': pathname,
      },
    });
  } catch (err) {
    // Prerender упал или timeout — не ломаем сайт, возвращаем SPA
    console.error(`[bot-render] prerender failed for ${pathname}:`, err);
    return context.next();
  }
};