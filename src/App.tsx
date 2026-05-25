import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import MapPage from './pages/MapPage';
import FavoritesPage from './pages/FavoritesPage';
import ComparePage from './pages/ComparePage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import NetworkTenantsPage from './pages/NetworkTenantsPage';
import PropertyPage from './pages/PropertyPage';
import CategoryPage from './pages/CategoryPage';
import NotFoundPage from './pages/NotFoundPage';
import DeclinedPage from './pages/DeclinedPage';
import { NewsListPage, NewsArticlePage } from './pages/NewsPage';
import LeadsListPage from './pages/LeadsListPage';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CompareBar from './components/CompareBar';
import AnalyticsLoader from './components/AnalyticsLoader';
import ScrollToTop from './components/ScrollToTop';
import ConsentBanner, { hasConsent } from './components/ConsentBanner';
import SeoHead from './components/SeoHead';
import { fetchListings } from './lib/api';
import { useAuth } from './contexts/AuthContext';


export type PropertyType = 'office' | 'retail' | 'warehouse' | 'restaurant' | 'business' | 'production' | 'hotel' | 'gab';
export type DealType = 'sale' | 'rent' | 'business';

export interface Property {
  id: number;
  title: string;
  type: PropertyType;
  deal: DealType;
  address: string;
  district: string;
  area: number;
  price: number;
  pricePerM2?: number;
  payback?: number;
  profit?: number;
  image: string;
  tags: string[];
  description: string;
  floor?: number;
  totalFloors?: number;
  lat: number;
  lng: number;
  isHot?: boolean;
  isNew?: boolean;
  isExclusive?: boolean;
  isUrgent?: boolean;
  publicCode?: number;
  tenantName?: string;
  monthlyRent?: number;
  yearlyRent?: number;
  purpose?: string;
  finishing?: string;
  ceilingHeight?: number;
  electricityKw?: number;
  utilities?: string;
  roadLine?: string;
  updatedAt?: string;
  createdAt?: string;
  lastEditedAt?: string;
}

export type Page = 'home' | 'catalog' | 'map' | 'favorites' | 'compare' | 'network-tenants' | 'news';
export type AppView = 'site' | 'login' | 'admin';

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
    const publicPaths = ['/object/', '/catalog', '/map', '/favorites', '/compare', '/network-tenants', '/news', '/leads', '/declined'];
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
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setViewState] = useState<AppView>(() => loadInitialView());
  const [adminInitialSection, setAdminInitialSection] = useState<string | undefined>();
  const [consentGiven, setConsentGiven] = useState<boolean>(() => hasConsent());

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

  // Тихий cron-пинг: при каждой загрузке сайта проверяем, не пора ли запустить SEO-оптимизацию.
  // Throttle на стороне клиента — не чаще раза в 60 мин. Сервер дополнительно проверяет расписание.
  useEffect(() => {
    const SEO_CRON_URL = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';
    const NEWS_CRON_URL = 'https://functions.poehali.dev/984cad3a-0783-4408-a614-52ed36f8c77f';
    const THROTTLE_MS = 60 * 60 * 1000; // 1 час
    try {
      const seoLast = parseInt(localStorage.getItem('seo_cron_last_ping') || '0', 10);
      if (Date.now() - seoLast > THROTTLE_MS) {
        localStorage.setItem('seo_cron_last_ping', String(Date.now()));
        fetch(SEO_CRON_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ping' }) }).catch(() => {});
      }
      const newsLast = parseInt(localStorage.getItem('news_cron_last_ping') || '0', 10);
      if (Date.now() - newsLast > THROTTLE_MS) {
        localStorage.setItem('news_cron_last_ping', String(Date.now()));
        fetch(`${NEWS_CRON_URL}?action=ping_cron`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchListings()
      .then(data => {
        setProperties(data);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        setError('Не удалось загрузить объекты. Попробуйте обновить страницу.');
      })
      .finally(() => setLoading(false));
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

  const compareProperties = properties.filter(p => compareList.includes(p.id));
  const favoriteProperties = properties.filter(p => favorites.includes(p.id));

  const ADMIN_ROLES = ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'];

  // Авто-переход: как только user появился в контексте и мы на экране логина — редиректим
  useEffect(() => {
    if (view === 'login' && user && !authLoading) {
      setView(ADMIN_ROLES.includes(user.role) ? 'admin' : 'site');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (view === 'login') {
    return (
      <>
        <SeoHead title="Вход для сотрудников" noindex />
        <LoginPage onSuccess={() => { /* переход сработает через useEffect выше */ }} onBack={() => setView('site')} />
      </>
    );
  }

  if (view === 'admin') {
    if (authLoading) {
      return <div className="min-h-screen flex items-center justify-center">Загрузка...</div>;
    }
    if (!user) {
      return (
        <>
          <SeoHead title="Вход для сотрудников" noindex />
          <LoginPage onSuccess={() => setView(user && ADMIN_ROLES.includes((user as { role: string }).role) ? 'admin' : 'site')} onBack={() => setView('site')} />
        </>
      );
    }
    if (!ADMIN_ROLES.includes(user.role)) {
      return (
        <>
          <SeoHead title="Вход для сотрудников" noindex />
          <LoginPage onSuccess={() => setView('admin')} onBack={() => setView('site')} />
        </>
      );
    }
    return (
      <>
        <SeoHead title="Админ-панель" noindex />
        <AdminPage onExit={() => { setView('site'); setAdminInitialSection(undefined); }} initialSection={adminInitialSection as string | undefined} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-brand-blue/20 border-t-brand-blue animate-spin" />
          <div className="text-sm text-muted-foreground">Загружаем объекты из базы...</div>
        </div>
      </div>
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
            />
          } />
          <Route path="/map" element={
            <MapPage
              properties={properties}
              favorites={favorites}
              compareList={compareList}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
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
      </main>

      <Footer onLogin={() => setView('login')} setCurrentPage={setCurrentPage} />

      {compareList.length > 0 && currentPage !== 'compare' && (
        <CompareBar
          count={compareList.length}
          onCompare={() => setCurrentPage('compare')}
          onClear={clearCompare}
        />
      )}

      {!consentGiven && location.pathname !== '/declined'
        && !location.pathname.startsWith('/admin')
        && !location.pathname.startsWith('/login') && (
        <ConsentBanner onAccept={() => setConsentGiven(true)} />
      )}

    </div>
  );
}