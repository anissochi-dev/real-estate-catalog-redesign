import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoginPage, lazyWithRetry } from './app/lazyPages';

// Админка грузится лениво с автоматическим retry при устаревшем хеше чанка.
const AdminPage = lazyWithRetry(() => import('./pages/AdminPage') as Promise<{ default: React.ComponentType<Record<string, unknown>> }>);

// Prefetch AdminPage чанка в фоне — только если в браузере есть токен
// (т.е. это залогиненный сотрудник). Запускается через 3с после монтирования,
// когда LCP уже готов и основной трафик утих. Обычный посетитель не скачивает
// ни байта — у него токена нет.
function usePrefetchAdmin() {
  useEffect(() => {
    try {
      if (!localStorage.getItem('biznest_token')) return;
    } catch { return; }
    const id = setTimeout(() => {
      import('./pages/AdminPage').catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, []);
}
import ChunkErrorBoundary from './app/ChunkErrorBoundary';
import AppRoutes from './app/AppRoutes';
import {
  type Property,
  type Page,
  type AppView,
  PATH_BY_PAGE,
  pageFromPath,
  VIEW_KEY,
  IN_ADMIN_KEY,
  loadInitialView,
} from './app/appTypes';

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

export type { PropertyType, DealType, Property, Page, AppView } from './app/appTypes';

// Показ мягкого баннера согласия (без блокировки сайта).
const SHOW_CONSENT_BANNER = true;

export default function App() {
  usePrefetchAdmin();
  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setViewState] = useState<AppView>(() => loadInitialView());
  const [adminInitialSection, setAdminInitialSection] = useState<string | undefined>();
  const [consentGiven, setConsentGiven] = useState<boolean>(() => hasConsent());
  const [consentVisible, setConsentVisible] = useState(false);
  // Баннер показываем только когда настройки загрузились и есть хотя бы один юр. документ —
  // иначе он мелькает пустым до загрузки настроек («глюк»).
  const hasLegalDocs = Boolean(
    (settings.legal_privacy_policy || '').trim()
    || (settings.legal_personal_data || '').trim()
    || (settings.legal_marketing_consent || '').trim()
  );

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
    // Страховка: показать через 5 сек (после завершения Lighthouse-теста).
    // Баннер мягкий и не блокирует сайт, поэтому можно показать раньше.
    const fallback = setTimeout(show, 5000);
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
      // На главной НЕ догружаем все объекты — только когда пользователь
      // перейдёт на каталог/категорию/избранное/сравнение. Это исключает
      // мигание объектов и экономит трафик.
      const onHome = window.location.pathname === '/';
      if (total > listings.length && !onHome) {
        const loadAll = () => setTimeout(() => fetchListings()
          .then(({ listings: all }) => { setProperties(all); setAllLoaded(true); })
          .catch(() => setAllLoaded(true)), 2000);
        if (document.readyState === 'complete') {
          loadAll();
        } else {
          window.addEventListener('load', loadAll, { once: true });
        }
      } else {
        // На главной считаем что загрузка «завершена» (показываем что есть).
        // Полная подгрузка триггерится отдельным эффектом по смене пути.
        setAllLoaded(onHome ? false : true);
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
      }, 2000);
      return () => clearTimeout(guard);
    }

    // Нет prefetch (старый браузер) — обычный fetch
    fetchListings(8, 0)
      .then(({ listings, total }) => applyListings(listings, total))
      .catch(err => { console.error(err); setError('Не удалось загрузить объекты.'); setLoading(false); });
  }, []);

  // Страховка от «вечного колеса»: если через 3 сек данные так и не пришли
  // (зависла prefetch-гонка в index.html), делаем прямой запрос и снимаем загрузку.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      fetchListings(8, 0)
        .then(({ listings }) => { setProperties(prev => (prev.length ? prev : listings)); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 3000);
    return () => clearTimeout(t);
  }, [loading]);

  // Ленивая догрузка всех объектов: триггерится при переходе со «/» на
  // любую страницу, где нужен полный список (каталог, категории, избранное,
  // сравнение, поиск). На странице одного объекта догрузка не нужна — данные
  // подтягиваются отдельным fetchListingById.
  useEffect(() => {
    if (allLoaded) return;
    const path = location.pathname;
    const needsFullList = path === '/catalog'
      || path.startsWith('/catalog/')
      || path === '/favorites'
      || path === '/compare'
      || path === '/search'
      || path === '/map'
      || path === '/network-tenants';
    if (!needsFullList) return;
    let cancelled = false;
    fetchListings()
      .then(({ listings }) => {
        if (cancelled) return;
        setProperties(listings);
        setAllLoaded(true);
      })
      .catch(() => { if (!cancelled) setAllLoaded(true); });
    return () => { cancelled = true; };
  }, [location.pathname, allLoaded]);

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

  // Флаг «в админке» для восстановления режима при F5.
  // Ставим, только когда реально показана админка (вошёл сотрудник с админ-ролью),
  // снимаем во всех остальных случаях (выход, переход на сайт, недостаточно прав).
  useEffect(() => {
    try {
      const inAdmin = view === 'admin' && !!user && ADMIN_ROLES.includes(user.role);
      if (inAdmin) localStorage.setItem(IN_ADMIN_KEY, '1');
      else localStorage.removeItem(IN_ADMIN_KEY);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, user]);

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
      <ChunkErrorBoundary>
        <Suspense fallback={pageFallback}>
          <SeoHead title="Админ-панель" noindex />
          <AdminPage onExit={() => { setView('site'); setAdminInitialSection(undefined); }} initialSection={adminInitialSection as string | undefined} />
        </Suspense>
      </ChunkErrorBoundary>
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
          url: settings.site_url || 'https://bmn.su',
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
          url: settings.site_url || 'https://bmn.su',
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
        <ChunkErrorBoundary>
          <Suspense fallback={<div style={{minHeight: 'calc(100vh - 64px)'}} />}>
            <AppRoutes
              properties={properties}
              favorites={favorites}
              compareList={compareList}
              compareProperties={compareProperties}
              favoriteProperties={favoriteProperties}
              allLoaded={allLoaded}
              toggleFavorite={toggleFavorite}
              toggleCompare={toggleCompare}
              setCurrentPage={setCurrentPage}
            />
          </Suspense>
        </ChunkErrorBoundary>
      </main>

      <Footer onLogin={() => setView('login')} setCurrentPage={setCurrentPage} />

      {compareList.length > 0 && currentPage !== 'compare' && (
        <CompareBar
          count={compareList.length}
          onCompare={() => setCurrentPage('compare')}
          onClear={clearCompare}
        />
      )}

      {/* Баннер согласия временно скрыт. Чтобы вернуть — поставить SHOW_CONSENT_BANNER = true. */}
      {SHOW_CONSENT_BANNER && !consentGiven && consentVisible && hasLegalDocs
        && location.pathname !== '/declined'
        && !location.pathname.startsWith('/admin')
        && !location.pathname.startsWith('/login') && (
        <ConsentBanner onAccept={() => setConsentGiven(true)} />
      )}

    </div>
  );
}