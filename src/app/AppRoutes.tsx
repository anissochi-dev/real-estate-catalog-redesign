import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import {
  PropertyPage,
  CatalogPage,
  MapPage,
  FavoritesPage,
  ComparePage,
  NetworkTenantsPage,
  CategoryPage,
  DistrictPage,
  NotFoundPage,
  DeclinedPage,
  NewsListPage,
  NewsArticlePage,
  LeadsListPage,
  LeadDetailPage,
} from './lazyPages';
import type { Property, Page } from './appTypes';

interface AppRoutesProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  compareProperties: Property[];
  favoriteProperties: Property[];
  allLoaded: boolean;
  toggleFavorite: (id: number) => void;
  toggleCompare: (id: number) => void;
  setCurrentPage: (p: Page) => void;
}

export default function AppRoutes({
  properties,
  favorites,
  compareList,
  compareProperties,
  favoriteProperties,
  allLoaded,
  toggleFavorite,
  toggleCompare,
  setCurrentPage,
}: AppRoutesProps) {
  return (
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
      <Route path="/district/:district" element={
        <DistrictPage
          properties={properties}
          favorites={favorites}
          compareList={compareList}
          onToggleFavorite={toggleFavorite}
          onToggleCompare={toggleCompare}
        />
      } />
      <Route path="/news" element={<NewsListPage />} />
      <Route path="/news/:slug" element={<NewsArticlePage />} />
      <Route path="/leads" element={<LeadsListPage />} />
      <Route path="/request/:slug" element={<LeadDetailPage />} />
      <Route path="/declined" element={<DeclinedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}