import { useEffect, useState, useMemo, Suspense, type ReactNode } from 'react';
import { useLocation, useNavigate } from "@/lib/router-compat";

import ChunkErrorBoundary from './ChunkErrorBoundary';
import AppViewManager, { ADMIN_ROLES } from './AppViewManager';
import { AppStateCtx, type AppState } from './AppStateContext';
import { useListings } from './useListings';
import { useCrons } from './useCrons';
import { useConsentBanner } from './useConsentBanner';
import {
  type Page,
  type Property,
  type AppView,
  PATH_BY_PAGE,
  pageFromPath,
  VIEW_KEY,
  IN_ADMIN_KEY,
  IN_CLIENT_KEY,
  loadInitialView,
} from './appTypes';

import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CompareBar from '../components/CompareBar';
import AnalyticsLoader from '../components/AnalyticsLoader';
import ScrollToTop from '../components/ScrollToTop';
import ConsentBanner from '../components/ConsentBanner';
import SeoHead from '../components/SeoHead';
import SchemaOrg, { makeOrganizationSchema, makeWebSiteSchema } from '../components/SchemaOrg';
import { getSiteUrl } from '../lib/siteUrl';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';

// Префетч AdminPage чанка в фоне — только если в браузере есть токен
// (т.е. это залогиненный сотрудник). Запускается через 3с после монтирования,
// когда LCP уже готов и основной трафик утих. Обычный посетитель не скачивает
// ни байта — у него токена нет.
function usePrefetchAdmin() {
  useEffect(() => {
    try {
      if (!localStorage.getItem('biznest_token')) return;
    } catch { return; }
    const id = setTimeout(() => {
      import('../pages/AdminPage').catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, []);
}

// Service Worker с офлайн-заглушкой и авто-перезагрузка при ошибке загрузки чанка
// (раньше — в main.tsx).
function useBrowserBootstrap() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ }); };
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      try {
        const last = Number(sessionStorage.getItem('__vite_preload_reload__') || '0');
        if (Date.now() - last < 15000) return;
        sessionStorage.setItem('__vite_preload_reload__', String(Date.now()));
      } catch { /* ignore */ }
      window.location.reload();
    };
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => window.removeEventListener('vite:preloadError', onPreloadError);
  }, []);
}

// Показ мягкого баннера согласия (без блокировки сайта).
const SHOW_CONSENT_BANNER = true;

export default function SiteShell({ children, initialListings }: { children: ReactNode; initialListings?: { listings: Property[]; total: number } }) {
  usePrefetchAdmin();
  useCrons();
  useBrowserBootstrap();

  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();

  // Вид (сайт / вход / админка / кабинет) хранится в localStorage — читаем после гидрации.
  const [view, setViewState] = useState<AppView>('site');
  const [viewLoaded, setViewLoaded] = useState(false);
  const [adminInitialSection, setAdminInitialSection] = useState<string | undefined>();
  const [pendingNavigatePath, setPendingNavigatePath] = useState<string | undefined>();

  useEffect(() => {
    setViewState(loadInitialView());
    setViewLoaded(true);
  }, []);

  const { consentGiven, setConsentGiven, consentVisible } = useConsentBanner();

  // Баннер показываем только когда настройки загрузились и есть хотя бы один юр. документ —
  // иначе он мелькает пустым до загрузки настроек («глюк»).
  const hasLegalDocs = Boolean(
    (settings.legal_privacy_policy || '').trim()
    || (settings.legal_personal_data || '').trim()
    || (settings.legal_marketing_consent || '').trim()
  );

  const setView = (v: AppView) => {
    setViewState(v);
    try {
      if (v === 'admin') localStorage.setItem(VIEW_KEY, 'admin');
      else if (v === 'client') localStorage.setItem(VIEW_KEY, 'client');
      else localStorage.removeItem(VIEW_KEY);
    } catch {
      // ignore
    }
  };

  const [favorites, setFavorites] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);

  const { properties, allLoaded, error } = useListings(initialListings);

  const currentPage: Page = pageFromPath(location.pathname);
  const setCurrentPage = (p: Page) => { navigate(PATH_BY_PAGE[p]); };

  // Favicon и Apple Touch Icon из настроек сайта (BrandKitTab в админке) —
  // подменяют статичные иконки, если админ загрузил свои.
  useEffect(() => {
    const setIcon = (rel: string, href?: string) => {
      if (!href) return;
      let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', rel);
        document.head.appendChild(link);
      }
      link.setAttribute('href', href);
    };
    setIcon('icon', settings.favicon_url);
    setIcon('apple-touch-icon', settings.apple_touch_icon_url);
  }, [settings.favicon_url, settings.apple_touch_icon_url]);

  // SPA redirect: восстанавливаем путь после 404.html редиректа
  useEffect(() => {
    try {
      const redirect = sessionStorage.getItem('spa_redirect');
      if (redirect && redirect !== '/') {
        sessionStorage.removeItem('spa_redirect');
        navigate(redirect, { replace: true });
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Авто-переход: как только user появился в контексте и мы на экране логина
  useEffect(() => {
    if (view === 'login' && user && !authLoading) {
      if (ADMIN_ROLES.includes(user.role)) setView('admin');
      else if (user.role === 'client') setView('client');
      else setView('site');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Переход на нужный путь после выхода из админки на сайт
  useEffect(() => {
    if (view === 'site' && pendingNavigatePath) {
      navigate(pendingNavigatePath, { replace: false });
      setPendingNavigatePath(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pendingNavigatePath]);

  // Флаги восстановления вида при F5
  useEffect(() => {
    try {
      if (!viewLoaded || authLoading) return;
      const inAdmin = view === 'admin' && !!user && ADMIN_ROLES.includes(user.role);
      if (inAdmin) localStorage.setItem(IN_ADMIN_KEY, '1');
      else localStorage.removeItem(IN_ADMIN_KEY);
      const inClient = view === 'client' && !!user && user.role === 'client';
      if (inClient) localStorage.setItem(IN_CLIENT_KEY, '1');
      else localStorage.removeItem(IN_CLIENT_KEY);
    } catch { /* ignore */ }
  }, [view, user, authLoading, viewLoaded]);

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

  const appState: AppState = {
    properties,
    favorites,
    compareList,
    compareProperties,
    favoriteProperties,
    allLoaded,
    toggleFavorite,
    toggleCompare,
    setCurrentPage,
  };

  // login / admin views
  if (view === 'login' || view === 'admin' || view === 'client') {
    return (
      <AppViewManager
        view={view}
        user={user}
        authLoading={authLoading}
        adminInitialSection={adminInitialSection}
        onSetView={setView}
        onSetAdminInitialSection={setAdminInitialSection}
        onExitToPath={(path) => { setPendingNavigatePath(path); setAdminInitialSection(undefined); setView('site'); }}
      />
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
          url: getSiteUrl(settings.site_url),
          phone: settings.company_phone,
          email: settings.company_email,
          address: settings.company_address,
          city: settings.main_city || 'Краснодар',
          logo: settings.logo_url,
          description: settings.seo_description,
          foundingYear: settings.company_since_year,
        })}
      />
      <SchemaOrg
        id="website"
        schema={makeWebSiteSchema({
          name: settings.company_name || 'Бизнес. Маркетинг. Недвижимость.',
          url: getSiteUrl(settings.site_url),
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
        onClientDashboard={() => setView('client')}
      />

      <main>
        <ChunkErrorBoundary>
          <Suspense fallback={<div style={{ minHeight: 'calc(100vh - 64px)' }} />}>
            <AppStateCtx.Provider value={appState}>
              {children}
            </AppStateCtx.Provider>
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

      {SHOW_CONSENT_BANNER && !consentGiven && consentVisible && hasLegalDocs
        && location.pathname !== '/declined'
        && !location.pathname.startsWith('/admin')
        && !location.pathname.startsWith('/login') && (
        <ConsentBanner onAccept={() => setConsentGiven(true)} />
      )}
    </div>
  );
}