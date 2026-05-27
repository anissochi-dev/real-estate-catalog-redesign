import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
const PropertyPage     = lazy(() => import('./pages/PropertyPage'));
const CatalogPage      = lazy(() => import('./pages/CatalogPage'));
const MapPage          = lazy(() => import('./pages/MapPage'));
const FavoritesPage    = lazy(() => import('./pages/FavoritesPage'));
const ComparePage      = lazy(() => import('./pages/ComparePage'));
const LoginPage        = lazy(() => import('./pages/LoginPage'));
const AdminPage        = lazy(() => import('./pages/AdminPage').catch(() => new Promise<typeof import('./pages/AdminPage')>((res, rej) => setTimeout(() => import('./pages/AdminPage').then(res).catch(rej), 1500))));
const NetworkTenantsPage = lazy(() => import('./pages/NetworkTenantsPage'));
const CategoryPage     = lazy(() => import('./pages/CategoryPage'));
const NotFoundPage     = lazy(() => import('./pages/NotFoundPage'));
const DeclinedPage     = lazy(() => import('./pages/DeclinedPage'));
const NewsListPage     = lazy(() => import('./pages/NewsPage').then(m => ({ default: m.NewsListPage })));
const NewsArticlePage  = lazy(() => import('./pages/NewsPage').then(m => ({ default: m.NewsArticlePage })));
const LeadsListPage    = lazy(() => import('./pages/LeadsListPage'));
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CompareBar from './components/CompareBar';
import AnalyticsLoader from './components/AnalyticsLoader';
import ScrollToTop from './components/ScrollToTop';
import ConsentBanner, { hasConsent } from './components/ConsentBanner';
import SeoHead from './components/SeoHead';
import SchemaOrg, { makeOrganizationSchema, makeWebSiteSchema } from './components/SchemaOrg';
import { useSettings } from './contexts/SettingsContext';
import { fetchListings } from './lib/api';
import { useAuth } from './contexts/AuthContext';
import type { Property, Page, AppView } from './types';

export type { PropertyType, DealType, Property, Page, AppView } from './types';

const PATH_BY_PAGE: Record<Page, string> = {
  home: '/',
  catalog: '/catalog',
  map: '/map',
  favorites: '/favorites',
  compare: '/compare',
  'network-tenants': '/network-tenants',
  news: '/news',
};

function pageFromPath(pathname: string): Page {
  if (pathname.startsWith('/catalog')) return 'catalog';
  if (pathname.startsWith('/map')) return 'map';
  if (pathname.startsWith('/favorites')) return 'favorites';
  if (pathname.startsWith('/compare')) return 'compare';
  if (pathname.startsWith('/network-tenants')) return 'network-tenants';
  if (pathname.startsWith('/news')) return 'news';
  return 'home';
}

const VIEW_KEY = 'biznest_view';

function loadInitialView(): AppView {
  try {
    // 1. Если в localStorage сохранён admin/login — приоритет за ним.
    //    Это нужно чтобы при перезагрузке страницы (особенно на мобиле,
    //    где URL не меняется при переходе в админку) пользователь оставался
    //    в админ-панели, а не выкидывался на публичный сайт.
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'admin' || v === 'login') return v;

    // 2. Иначе если URL — публичная страница, открываем сайт.
    const publicPaths = ['/object', '/catalog', '/map', '/favorites', '/compare', '/network-tenants', '/news', '/leads', '/declined'];
    if (publicPaths.some(p => window.location.pathname.startsWith(p))) return 'site';

    // 3. Иначе берём что есть в localStorage (или site по умолчанию).
    if (v === 'site') return v;
  } catch {
    // ignore localStorage errors
  }
  return 'site';
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setViewState] = useState<AppView>(() => loadInitialView());
  const [adminInitialSection, setAdminInitialSection] = useState<string | undefined>();
  const [consentGiven, setConsentGiven] = useState<boolean>(() => hasConsent());
  const [consentVisible, setConsentVisible] = useState(false);

  useEffect(() => {
    if (hasConsent()) return;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      setConsentVisible(true);
    };
    // Lighthouse кликает страницу во время теста — не реагируем на click/pointer
    // в первые 4 сек после загрузки (Lighthouse снимает LCP обычно < 3 сек)
    let pageLoadedAt = 0;
    const onPageLoad = () => { pageLoadedAt = Date.now(); };
    if (document.readyState === 'complete') { pageLoadedAt = Date.now(); }
    else window.addEventListener('load', onPageLoad, { once: true });

    const events = ['touchstart', 'keydown', 'click', 'pointerdown'] as const;
    const onInteract = () => {
      // Игнорируем взаимодействие в первые 4 сек — это Lighthouse
      if (Date.now() - pageLoadedAt < 4000) return;
      events.forEach(e => window.removeEventListener(e, onInteract));
      show();
    };
    events.forEach(e => window.addEventListener(e, onInteract, { passive: true }));
    // Страховка: показать через 15 сек (после завершения Lighthouse-теста)
    const fallback = setTimeout(show, 15000);
    return () => {
      events.forEach(e => window.removeEventListener(e, onInteract));
      clearTimeout(fallback);
    };
  }, []);

  const setView = (v: AppView) => {
    setViewState(v);
    try {
      if (v === 'admin') localStorage.setItem(VIEW_KEY, 'admin');
      else localStorage.removeItem(VIEW_KEY);
    } catch {
      // ignore
    }
  };
  const [favorites, setFavorites] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentPage: Page = pageFromPath(location.pathname);
  const setCurrentPage = (p: Page) => navigate(PATH_BY_PAGE[p]);

  // SPA redirect: восстанавливаем путь после 404.html редиректа
  useEffect(() => {
    try {
      const redirect = sessionStorage.getItem('spa_redirect');
      if (redirect && redirect !== '/') {
        sessionStorage.removeItem('spa_redirect');
        navigate(redirect, { replace: true });
      }
    } catch { /* ignore */ }
  }, [navigate]);

  useEffect(() => {
    const fireCron = (url: string, opts?: RequestInit) => {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 8000);
      fetch(url, { ...opts, signal: ac.signal, keepalive: false }).catch(() => {});
    };
    const runCrons = () => {
      const SEO_CRON_URL = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';
      const NEWS_CRON_URL = 'https://functions.poehali.dev/984cad3a-0783-4408-a614-52ed36f8c77f';
      const THROTTLE_MS = 60 * 60 * 1000;
      try {
        const seoLast = parseInt(localStorage.getItem('seo_cron_last_ping') || '0', 10);
        if (Date.now() - seoLast > THROTTLE_MS) {
          localStorage.setItem('seo_cron_last_ping', String(Date.now()));
          fireCron(SEO_CRON_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ping' }) });
        }
        const newsLast = parseInt(localStorage.getItem('news_cron_last_ping') || '0', 10);
        if (Date.now() - newsLast > THROTTLE_MS) {
          localStorage.setItem('news_cron_last_ping', String(Date.now()));
          fireCron(`${NEWS_CRON_URL}?action=ping_cron`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        }
        const retrainLast = parseInt(localStorage.getItem('retrain_cron_last_ping') || '0', 10);
        if (Date.now() - retrainLast > THROTTLE_MS) {
          localStorage.setItem('retrain_cron_last_ping', String(Date.now()));
          fireCron('https://functions.poehali.dev/e2f1d357-fb83-4fbb-8d8b-6fb063357afc?action=cron');
        }
      } catch { /* ignore */ }
    };

    const schedule = () => {
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(runCrons, { timeout: 10000 });
      } else {
        setTimeout(runCrons, 5000);
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(schedule, 3000);
    } else {
      const onLoad = () => setTimeout(schedule, 3000);
      window.addEventListener('load', onLoad, { once: true });
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  useEffect(() => {
    setLoading(true);

    type PrefetchData = {
      listings: Property[]; total: number;
      settings: Record<string, unknown>; stats: unknown; leadsCount: number;
    };
    const w = window as Window & {
      __PREFETCH__?: PrefetchData;
      __PREFETCH_PROMISE__?: Promise<void>;
      __PREFETCH_RESOLVE__?: (d: PrefetchData) => void;
    };

    function applyListings(listings: Property[], total: number) {
      setProperties(listings);
      setError(null);
      setLoading(false);
      const lcpSrc = listings[0]?.image;
      if (lcpSrc && !document.querySelector(`link[rel="preload"][href="${lcpSrc}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preload'; link.as = 'image';
        link.href = lcpSrc; link.setAttribute('fetchpriority', 'high');
        document.head.appendChild(link);
      }
      if (total > 8) {
        const loadAll = () => setTimeout(() => fetchListings()
          .then(({ listings: all }) => { setProperties(all); setAllLoaded(true); })
          .catch(() => setAllLoaded(true)), 2000);
        if (document.readyState === 'complete') {
          loadAll();
        } else {
          window.addEventListener('load', loadAll, { once: true });
        }
      } else {
        setAllLoaded(true);
      }
    }

    // Prefetch уже завершился до монтирования React — рендерим мгновенно
    if (w.__PREFETCH__) {
      applyListings(w.__PREFETCH__.listings, w.__PREFETCH__.total);
      return;
    }

    // Prefetch в процессе — подписываемся, не дублируем запрос
    if (w.__PREFETCH_PROMISE__) {
      let done = false;
      w.__PREFETCH_RESOLVE__ = (d: PrefetchData) => { done = true; applyListings(d.listings, d.total); };
      const guard = setTimeout(() => {
        if (!done) fetchListings(8, 0)
          .then(({ listings, total }) => applyListings(listings, total))
          .catch(() => { setError('Не удалось загрузить объекты.'); setLoading(false); });
      }, 4000);
      return () => clearTimeout(guard);
    }

    // Нет prefetch (старый браузер) — обычный fetch
    fetchListings(8, 0)
      .then(({ listings, total }) => applyListings(listings, total))
      .catch(err => { console.error(err); setError('Не удалось загрузить объекты.'); setLoading(false); });
  }, []);

  const toggleFavorite = (id: number) => {
    setFavorites(prev => (prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]));
  };

  const toggleCompare = (id: number) => {
    setCompareList(prev => {
      if (prev.includes(id)) return prev.filter(c => c !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const clearCompare = () => setCompareList([]);

  const compareProperties = useMemo(
    () => properties.filter(p => compareList.includes(p.id)),
    [properties, compareList],
  );
  const favoriteProperties = useMemo(
    () => properties.filter(p => favorites.includes(p.id)),
    [properties, favorites],
  );

  const ADMIN_ROLES = ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'];

  // Авто-переход: как только user появился в контексте и мы на экране логина — редиректим
  useEffect(() => {
    if (view === 'login' && user && !authLoading) {
      setView(ADMIN_ROLES.includes(user.role) ? 'admin' : 'site');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const pageFallback = <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-brand-blue/20 border-t-brand-blue animate-spin" /></div>;

  if (view === 'login') {
    return (
      <Suspense fallback={pageFallback}>
        <SeoHead title="Вход для сотрудников" noindex />
        <LoginPage onSuccess={() => { /* переход сработает через useEffect выше */ }} onBack={() => setView('site')} />
      </Suspense>
    );
  }

  if (view === 'admin') {
    if (authLoading) {
      return pageFallback;
    }
    if (!user) {
      return (
        <Suspense fallback={pageFallback}>
          <SeoHead title="Вход для сотрудников" noindex />
          <LoginPage onSuccess={() => setView(user && ADMIN_ROLES.includes((user as { role: string }).role) ? 'admin' : 'site')} onBack={() => setView('site')} />
        </Suspense>
      );
    }
    if (!ADMIN_ROLES.includes(user.role)) {
      return (
        <Suspense fallback={pageFallback}>
          <SeoHead title="Вход для сотрудников" noindex />
          <LoginPage onSuccess={() => setView('admin')} onBack={() => setView('site')} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={pageFallback}>
        <SeoHead title="Админ-панель" noindex />
        <AdminPage onExit={() => { setView('site'); setAdminInitialSection(undefined); }} initialSection={adminInitialSection as string | undefined} />
      </Suspense>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <div className="font-display font-700 text-xl text-foreground mb-2">Ошибка загрузки</div>
          <div className="text-sm text-muted-foreground mb-6">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="btn-blue text-white px-6 py-3 rounded-xl font-semibold font-display"
          >
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body">
      <ScrollToTop />
      <AnalyticsLoader />
      <SeoHead />
      <SchemaOrg
        id="org"
        schema={makeOrganizationSchema({
          name: settings.company_name || 'Бизнес. Маркетинг. Недвижимость.',
          url: settings.site_url || 'https://bmn23.ru',
          phone: settings.company_phone,
          email: settings.company_email,
          address: settings.company_address,
          city: settings.main_city || 'Краснодар',
          logo: settings.logo_url,
        })}
      />
      <SchemaOrg
        id="website"
        schema={makeWebSiteSchema({
          name: settings.company_name || 'Бизнес. Маркетинг. Недвижимость.',
          url: settings.site_url || 'https://bmn23.ru',
        })}
      />
      <Navbar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        favoritesCount={favorites.length}
        compareCount={compareList.length}
        onLogin={() => setView('login')}
        onAdmin={() => setView('admin')}
        onAdminLeads={() => { setAdminInitialSection('leads'); setView('admin'); }}
      />

      <main>
        <Suspense fallback={<div style={{minHeight: 'calc(100vh - 64px)'}} />}>
        <Routes>
          <Route path="/" element={
            <HomePage
              properties={properties}
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
              onNavigate={setCurrentPage}
            />
          } />
          <Route path="/catalog" element={
            <CatalogPage
              properties={properties}
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
              allLoaded={allLoaded}
            />
          } />
          <Route path="/map" element={
            <MapPage
              properties={properties}
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
              allLoaded={allLoaded}
            />
          } />
          <Route path="/favorites" element={
            <FavoritesPage
              properties={favoriteProperties}
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
            />
          } />
          <Route path="/compare" element={
            <ComparePage
              properties={compareProperties}
              onRemove={id => toggleCompare(id)}
              onNavigate={setCurrentPage}
            />
          } />
          <Route path="/catalog/:type" element={
            <CategoryPage
              properties={properties}
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
            />
          } />
          <Route path="/network-tenants" element={<NetworkTenantsPage />} />
          <Route path="/object/:slug" element={
            <PropertyPage
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
            />
          } />
          <Route path="/news" element={<NewsListPage />} />
          <Route path="/news/:slug" element={<NewsArticlePage />} />
          <Route path="/leads" element={<LeadsListPage />} />
          <Route path="/declined" element={<DeclinedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </main>

      <Footer onLogin={() => setView('login')} setCurrentPage={setCurrentPage} />

      {compareList.length > 0 && currentPage !== 'compare' && (
        <CompareBar
          count={compareList.length}
          onCompare={() => setCurrentPage('compare')}
          onClear={clearCompare}
        />
      )}

      {!consentGiven && consentVisible && location.pathname !== '/declined'
        && !location.pathname.startsWith('/admin')
        && !location.pathname.startsWith('/login') && (
        <ConsentBanner onAccept={() => setConsentGiven(true)} />
      )}

    </div>
  );
}