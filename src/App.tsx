import { useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import MapPage from './pages/MapPage';
import FavoritesPage from './pages/FavoritesPage';
import ComparePage from './pages/ComparePage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import NetworkTenantsPage from './pages/NetworkTenantsPage';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CompareBar from './components/CompareBar';
import { fetchListings } from './lib/api';
import { useAuth } from './contexts/AuthContext';

export type PropertyType = 'office' | 'retail' | 'warehouse' | 'restaurant' | 'business' | 'production';
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
}

export type Page = 'home' | 'catalog' | 'map' | 'favorites' | 'compare' | 'network-tenants';
export type AppView = 'site' | 'login' | 'admin';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState<AppView>('site');
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [favorites, setFavorites] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (view === 'login') {
    return <LoginPage onSuccess={() => setView(user && ['admin', 'editor', 'manager'].includes(user.role) ? 'admin' : 'site')} onBack={() => setView('site')} />;
  }

  if (view === 'admin') {
    if (authLoading) {
      return <div className="min-h-screen flex items-center justify-center">Загрузка...</div>;
    }
    if (!user) {
      setView('login');
      return null;
    }
    if (!['admin', 'editor', 'manager'].includes(user.role)) {
      setView('site');
      return null;
    }
    return <AdminPage onExit={() => setView('site')} />;
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
      <Navbar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        favoritesCount={favorites.length}
        compareCount={compareList.length}
        onLogin={() => setView('login')}
        onAdmin={() => setView('admin')}
      />

      <main>
        {currentPage === 'home' && (
          <HomePage
            properties={properties}
            favorites={favorites}
            compareList={compareList}
            onToggleFavorite={toggleFavorite}
            onToggleCompare={toggleCompare}
            onNavigate={setCurrentPage}
          />
        )}
        {currentPage === 'catalog' && (
          <CatalogPage
            properties={properties}
            favorites={favorites}
            compareList={compareList}
            onToggleFavorite={toggleFavorite}
            onToggleCompare={toggleCompare}
          />
        )}
        {currentPage === 'map' && (
          <MapPage
            properties={properties}
            favorites={favorites}
            compareList={compareList}
            onToggleFavorite={toggleFavorite}
            onToggleCompare={toggleCompare}
          />
        )}
        {currentPage === 'favorites' && (
          <FavoritesPage
            properties={favoriteProperties}
            favorites={favorites}
            compareList={compareList}
            onToggleFavorite={toggleFavorite}
            onToggleCompare={toggleCompare}
          />
        )}
        {currentPage === 'compare' && (
          <ComparePage
            properties={compareProperties}
            onRemove={id => toggleCompare(id)}
            onNavigate={setCurrentPage}
          />
        )}
        {currentPage === 'network-tenants' && <NetworkTenantsPage />}
      </main>

      <Footer onLogin={() => setView('login')} setCurrentPage={setCurrentPage} />

      {compareList.length > 0 && currentPage !== 'compare' && (
        <CompareBar
          count={compareList.length}
          onCompare={() => setCurrentPage('compare')}
          onClear={clearCompare}
        />
      )}
    </div>
  );
}