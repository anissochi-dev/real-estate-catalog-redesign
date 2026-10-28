import {useState, type ReactNode} from "react";
import {HeadContent, Outlet, Scripts, createRootRoute} from "@tanstack/react-router";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "sonner";
import {TooltipProvider} from "@/components/ui/tooltip";
import {PLATFORM_META, PLATFORM_SCRIPTS} from "@/platform/scripts.gen";
import {HMR_CLIENT} from "@/platform/dev-hmr";
import {AuthProvider} from "@/contexts/AuthContext";
import {SettingsProvider} from "@/contexts/SettingsContext";
import SiteShell from "@/app/SiteShell";
import NotFoundPage from "@/pages/NotFoundPage";
import {loadSiteData} from "@/lib/ssrData";
import appCss from "@/index.css?url";

const TITLE = "Коммерческая недвижимость в Краснодаре — аренда и продажа";
const DESCRIPTION =
    "Коммерческая недвижимость и готовый бизнес в Краснодаре с 2007 г. Офисы, торговые площади, склады, рестораны, гостиницы. Подбор за 2 минуты с ИИ.";
const OG_IMAGE = "https://cdn.poehali.dev/projects/***/files/og-image-1784476153929.png";
const FAVICON = "https://cdn.poehali.dev/projects/***/files/favicon-1787938597971.jpg";
const FONTS =
    "https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500&display=swap";

// Редирект www.bmn.su → bmn.su (раньше — первым скриптом в index.html).
const WWW_REDIRECT = `if (window.location.hostname === 'www.bmn.su') {
  window.location.replace('https://bmn.su' + window.location.pathname + window.location.search + window.location.hash);
}`;

// Авто-восстановление при ошибке загрузки модуля (устаревший кеш браузера после деплоя).
const CHUNK_RECOVERY = `(function() {
  var RELOAD_KEY = '__chunk_reload_at__';
  var CLEAR_KEY = '__chunk_cache_cleared__';
  function isChunkError(msg) {
    msg = String(msg || '');
    return /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module/i.test(msg);
  }
  async function clearAllCaches() {
    try {
      if ('caches' in window) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function(k){ return caches.delete(k); }));
      }
    } catch(e) {}
    try {
      if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function(r){ return r.unregister(); }));
      }
    } catch(e) {}
  }
  function recover() {
    try {
      var last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
      if (Date.now() - last < 15000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch(e) {}
    var alreadyCleared = false;
    try { alreadyCleared = sessionStorage.getItem(CLEAR_KEY) === '1'; } catch(e) {}
    if (!alreadyCleared) {
      try { sessionStorage.setItem(CLEAR_KEY, '1'); } catch(e) {}
      clearAllCaches().finally(function(){
        var url = new URL(window.location.href);
        url.searchParams.set('_cb', String(Date.now()));
        window.location.replace(url.toString());
      });
    } else {
      try { sessionStorage.removeItem(CLEAR_KEY); } catch(e) {}
      var url = new URL(window.location.href);
      url.searchParams.set('_cb', String(Date.now()));
      window.location.replace(url.toString());
    }
  }
  window.addEventListener('error', function(e) {
    if (isChunkError(e && (e.message || (e.error && e.error.message)))) recover();
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e && e.reason;
    var msg = reason && (reason.message || reason.toString && reason.toString());
    if (isChunkError(msg)) recover();
  });
})();`;

// Лёгкая защита изображений: блокируем только ПКМ и перетаскивание картинок.
const IMG_PROTECT = `(function() {
  document.addEventListener('contextmenu', function(e) {
    if (e.target && (e.target.tagName === 'IMG' || (e.target.closest && e.target.closest('img')))) {
      e.preventDefault();
      return false;
    }
  }, true);
  document.addEventListener('dragstart', function(e) {
    if (e.target && e.target.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  }, true);
})();`;

export const Route = createRootRoute({
    // Первые объекты и публичные настройки — на сервере (раньше ранний prefetch в index.html).
    // Один раз на заход: при переходах по сайту не перезапрашиваем.
    loader: () => loadSiteData(),
    shouldReload: false,
    staleTime: Infinity,
    head: ({loaderData}) => {
        const st = loaderData?.settings || {};
        const ogImage = st.og_image_url || OG_IMAGE;
        const favicon = st.favicon_url || FAVICON;
        const appleIcon = st.apple_touch_icon_url || "/favicon.svg";
        const ymVerify = (st.yandex_webmaster_verification || "7099028f3e2220eb").trim();
        const gsVerify = (st.google_search_console_verification || "_wn0FH8jA1kMdfoNQIVxcMJ2KGd0C2hl2Bgc8nkMOGI").trim();
        const siteName = st.company_name || "Бизнес. Маркетинг. Недвижимость.";
        return {
        meta: [
            {charSet: "utf-8"},
            {name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover"},
            {name: "theme-color", content: "#1a3a6b"},
            {name: "format-detection", content: "telephone=yes"},
            {name: "apple-mobile-web-app-capable", content: "yes"},
            {name: "apple-mobile-web-app-status-bar-style", content: "black-translucent"},
            {name: "mobile-web-app-capable", content: "yes"},
            {title: TITLE},
            {name: "description", content: DESCRIPTION},
            {name: "keywords", content: st.seo_keywords || "коммерческая недвижимость Краснодар, готовый бизнес, аренда офиса, продажа склада, торговая площадь, ресторан"},
            {name: "robots", content: "index, follow"},
            {name: "mailru-domain", content: "6dS7udsVWBpJx77O"},
            {name: "yandex-verification", content: ymVerify},
            {name: "google-site-verification", content: gsVerify},
            {property: "og:type", content: "website"},
            {property: "og:site_name", content: siteName},
            {property: "og:title", content: TITLE},
            {property: "og:description", content: DESCRIPTION},
            {property: "og:url", content: "https://bmn.su/"},
            {property: "og:locale", content: "ru_RU"},
            {property: "og:image", content: ogImage},
            {name: "twitter:card", content: "summary_large_image"},
            {name: "twitter:title", content: TITLE},
            {name: "twitter:description", content: DESCRIPTION},
            {name: "twitter:image", content: ogImage},
            {property: "vk:image", content: "https://cdn.poehali.dev/projects/***/files/favicon-1779381523505.png"},
            ...PLATFORM_META,
        ],
        links: [
            {rel: "stylesheet", href: appCss},
            {rel: "apple-touch-icon", href: appleIcon},
            {rel: "icon", href: favicon},
            {rel: "sitemap", type: "application/xml", title: "Sitemap", href: "/sitemap.xml"},
            {rel: "preconnect", href: "https://cdn.poehali.dev"},
            {rel: "preconnect", href: "https://functions.poehali.dev"},
            {rel: "dns-prefetch", href: "https://functions.poehali.dev"},
            {rel: "dns-prefetch", href: "https://api-maps.yandex.ru"},
            {rel: "dns-prefetch", href: "https://mc.yandex.ru"},
            {rel: "preconnect", href: "https://fonts.googleapis.com"},
            {rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous"},
            {rel: "stylesheet", href: FONTS},
        ],
        // IMPORTANT: DO NOT REMOVE PLATFORM SCRIPTS AND THE DEV HMR CLIENT!
        scripts: [
            ...(import.meta.env.DEV ? [{children: HMR_CLIENT}] : []),
            ...PLATFORM_SCRIPTS,
            {children: WWW_REDIRECT},
            {children: CHUNK_RECOVERY},
            {children: IMG_PROTECT},
        ],
    };
    },
    component: RootComponent,
    notFoundComponent: NotFoundPage,
});

function RootComponent() {
    const data = Route.useLoaderData();
    // QueryClient — свой на каждый рендер приложения (на сервере не делим между посетителями).
    const [queryClient] = useState(
        () => new QueryClient({defaultOptions: {queries: {retry: 1, staleTime: 5 * 60_000}}}),
    );
    return (
        <RootDocument>
            <QueryClientProvider client={queryClient}>
                <SettingsProvider initial={data?.settings}>
                    <AuthProvider>
                        <TooltipProvider delayDuration={200}>
                            <SiteShell initialListings={data}>
                                <Outlet/>
                            </SiteShell>
                            <Toaster position="top-right" richColors closeButton/>
                        </TooltipProvider>
                    </AuthProvider>
                </SettingsProvider>
            </QueryClientProvider>
        </RootDocument>
    );
}

function RootDocument({children}: { children: ReactNode }) {
    return (
        <html lang="ru">
        <head>
            <HeadContent/>
        </head>
        <body>
        {children}
        <Scripts/>
        </body>
        </html>
    );
}
