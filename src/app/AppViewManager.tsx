import React, { Suspense } from 'react';
import { LoginPage, lazyWithRetry } from './lazyPages';
import ChunkErrorBoundary from './ChunkErrorBoundary';
import SeoHead from '../components/SeoHead';
import { type AppView } from './appTypes';
import ClientDashboard from '../pages/client/ClientDashboard';

const AdminPage = lazyWithRetry(() => import('../pages/AdminPage') as Promise<{ default: React.ComponentType<Record<string, unknown>> }>);

const pageFallback = (
  <div className="min-h-screen flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-4 border-brand-blue/20 border-t-brand-blue animate-spin" />
  </div>
);

interface AppViewManagerProps {
  view: AppView;
  user: { role: string } | null;
  authLoading: boolean;
  adminInitialSection: string | undefined;
  onSetView: (v: AppView) => void;
  onSetAdminInitialSection: (s: string | undefined) => void;
  onExitToPath: (path: string) => void;
}

const ADMIN_ROLES = ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'];

export default function AppViewManager({
  view,
  user,
  authLoading,
  adminInitialSection,
  onSetView,
  onSetAdminInitialSection,
  onExitToPath,
}: AppViewManagerProps) {
  if (view === 'login') {
    return (
      <Suspense fallback={pageFallback}>
        <SeoHead title="Войти" noindex />
        <LoginPage
          onSuccess={() => { /* переход сработает через useEffect в App */ }}
          onBack={() => onSetView('site')}
        />
      </Suspense>
    );
  }

  if (view === 'client') {
    if (authLoading) return pageFallback;
    if (!user || user.role !== 'client') {
      return (
        <Suspense fallback={pageFallback}>
          <SeoHead title="Личный кабинет" noindex />
          <LoginPage
            onSuccess={() => { /* переход через useEffect */ }}
            onBack={() => onSetView('site')}
          />
        </Suspense>
      );
    }
    return (
      <ChunkErrorBoundary>
        <SeoHead title="Личный кабинет" noindex />
        <ClientDashboard onExit={() => onSetView('site')} />
      </ChunkErrorBoundary>
    );
  }

  if (view === 'admin') {
    if (authLoading) {
      return pageFallback;
    }
    if (!user) {
      return (
        <Suspense fallback={pageFallback}>
          <SeoHead title="Войти" noindex />
          <LoginPage
            onSuccess={() => onSetView(user && ADMIN_ROLES.includes((user as { role: string }).role) ? 'admin' : 'site')}
            onBack={() => onSetView('site')}
          />
        </Suspense>
      );
    }
    if (!ADMIN_ROLES.includes(user.role)) {
      return (
        <Suspense fallback={pageFallback}>
          <SeoHead title="Войти" noindex />
          <LoginPage
            onSuccess={() => onSetView('admin')}
            onBack={() => onSetView('site')}
          />
        </Suspense>
      );
    }
    return (
      <ChunkErrorBoundary>
        <Suspense fallback={pageFallback}>
          <SeoHead title="Админ-панель" noindex />
          <AdminPage
            onExit={() => { onSetView('site'); onSetAdminInitialSection(undefined); }}
            onExitToPath={onExitToPath}
            initialSection={adminInitialSection as string | undefined}
          />
        </Suspense>
      </ChunkErrorBoundary>
    );
  }

  // null = рендерим основной сайт (view === 'site')
  return null;
}

export { ADMIN_ROLES };