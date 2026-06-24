import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { lazyWithRetry } from './app/lazyPages';

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
      import('./pages/AdminPage').catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, []);
}

import ChunkErrorBoundary from './app/ChunkErrorBoundary';
import AppRoutes from './app/AppRoutes';
import AppViewManager, { ADMIN_ROLES } from './app/AppViewManager';
import { useListings } from './app/useListings';
import { useCrons } from './app/useCrons';
import { useConsentBanner } from './app/useConsentBanner';
import {
  type Property,
  type Page,
  type AppView,
  PATH_BY_PAGE,
  pageFromPath,
  VIEW_KEY,
  IN_ADMIN_KEY,
  IN_CLIENT_KEY,
  loadInitialView,
} from './app/appTypes';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CompareBar from './components/CompareBar';
import AnalyticsLoader from './components/AnalyticsLoader';
import ScrollToTop from './components/ScrollToTop';
import ConsentBanner from './components/ConsentBanner';
import SeoHead from './components/SeoHead';
import SchemaOrg, { makeOrganizationSchema, makeWebSiteSchema } from './components/SchemaOrg';
import { useSettings } from './contexts/SettingsContext';
import { useAuth } from './contexts/AuthContext';

export type { PropertyType, DealType, Property, Page, AppView } from './app/appTypes';

// Показ мягкого баннера согласия (без блокировки сайта).
const SHOW_CONSENT_BANNER = true;

export default function App() {
  usePrefetchAdmin();
  useCrons();

  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setViewState] = useState<AppView>(() => loadInitialView());
  const [adminInitialSection, setAdminInitialSection] = useState<string | undefined>();

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

  const { properties, setProperties: _setProperties, allLoaded, setAllLoaded: _setAllLoaded, loading, error } = useListings();

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

  // Авто-переход: как только user появился в контексте и мы на экране логина
  useEffect(() => {
    if (view === 'login' && user && !authLoading) {
      if (ADMIN_ROLES.includes(user.role)) setView('admin');
      else if (user.role === 'client') setView('client');
      else setView('site');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Флаги восстановления вида при F5
  useEffect(() => {
    try {
      if (authLoading) return;
      const inAdmin = view === 'admin' && !!user && ADMIN_ROLES.includes(user.role);
      if (inAdmin) localStorage.setItem(IN_ADMIN_KEY, '1');
      else localStorage.removeItem(IN_ADMIN_KEY);
      const inClient = view === 'client' && !!user && user.role === 'client';
      if (inClient) localStorage.setItem(IN_CLIENT_KEY, '1');
      else localStorage.removeItem(IN_CLIENT_KEY);
    } catch { /* ignore */ }
     
  }, [view, user, authLoading]);

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

  const pageFallback = (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-blue/20 border-t-brand-blue animate-spin" />
    </div>
  );

  // login / admin views
  const managedView = (
    <AppViewManager
      view={view}
      user={user}
      authLoading={authLoading}
      adminInitialSection={adminInitialSection}
      onSetView={setView}
      onSetAdminInitialSection={setAdminInitialSection}
    />
  );

  if (view === 'login' || view === 'admin' || view === 'client') {
    return managedView;
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
        onClientDashboard={() => setView('client')}
      />

      <main>
        <ChunkErrorBoundary>
          <Suspense fallback={<div style={{ minHeight: 'calc(100vh - 64px)' }} />}>
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