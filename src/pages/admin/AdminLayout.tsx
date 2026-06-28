import { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AiChat from '@/components/admin/AiChat';
import { useAdminPolling, ROLE_DEFAULTS } from './useAdminPolling';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import AdminIdleWarning from './AdminIdleWarning';

export type AdminSection = 'dashboard' | 'listings' | 'leads' | 'network-tenants' | 'users' | 'pages' | 'settings' | 'ai-logs'
  | 'crm-owners' | 'crm-kanban' | 'crm-gamification' | 'crm-checks' | 'crm-payments'
  | 'phones' | 'news' | 'vb-knowledge' | 'seo' | 'districts' | 'marketing';

interface Props {
  section: AdminSection;
  setSection: (s: AdminSection) => void;
  onExit: () => void;
  onExitToPath: (path: string) => void;
  children: ReactNode;
}

import { createContext, useContext } from 'react';
export const ExitToPathCtx = createContext<((path: string) => void) | null>(null);
export const useExitToPath = () => useContext(ExitToPathCtx);

const NAV: { id: AdminSection; label: string; icon: string; roles: string[]; group?: string }[] = [
  { id: 'dashboard',        label: 'Дашборд',          icon: 'LayoutDashboard', roles: ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'] },
  { id: 'listings',         label: 'Объекты',           icon: 'Building2',       roles: ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'] },
  { id: 'leads',            label: 'Заявки',            icon: 'Inbox',           roles: ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'] },
  { id: 'users',            label: 'Пользователи',      icon: 'Users',           roles: ['admin', 'director'] },
  { id: 'news',             label: 'Новости',           icon: 'Newspaper',       roles: ['admin', 'editor', 'manager', 'director'] },
  { id: 'seo',              label: 'SEO',               icon: 'TrendingUp',      roles: ['admin', 'editor'] },
  { id: 'districts',        label: 'Районы',            icon: 'MapPin',          roles: ['admin', 'editor'] },
  { id: 'vb-knowledge',     label: 'База знаний ВБ',   icon: 'Brain',           roles: ['admin', 'editor', 'director'] },
  { id: 'marketing',        label: 'Маркетолог',        icon: 'Megaphone',       roles: ['admin', 'editor', 'manager', 'director'] },
  { id: 'settings',         label: 'Настройки',         icon: 'Settings',        roles: ['admin', 'editor'] },
  { id: 'phones',           label: 'Телефонная база',   icon: 'Phone',           roles: ['admin', 'editor', 'manager', 'director', 'office_manager'] },
  { id: 'crm-kanban',       label: 'Воронка сделок',   icon: 'KanbanSquare',    roles: ['admin', 'director', 'manager', 'office_manager'] },
  { id: 'crm-gamification', label: 'Рейтинг команды',  icon: 'Trophy',          roles: ['admin', 'director', 'manager', 'office_manager', 'broker'] },
  { id: 'crm-checks',       label: 'Проверки',          icon: 'ShieldCheck',     roles: ['admin', 'director', 'manager', 'office_manager', 'broker'] },
  { id: 'crm-payments',     label: 'Платежи',           icon: 'CreditCard',      roles: ['admin', 'director', 'office_manager', 'manager'] },
];

export default function AdminLayout({ section, setSection, onExit, onExitToPath, children }: Props) {
  const { user } = useAuth();
  const [aiOpen,      setAiOpen]      = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    socialPending,
    newLeadsCount,      setNewLeadsCount,
    newModerationCount, setNewModerationCount,
    idleWarning,
    secondsLeft,
    rolePerms,
    navOrder,
    stayLoggedIn,
  } = useAdminPolling(section);

  if (!user) return null;

  // Фильтрация пунктов меню по роли и правам
  const items = NAV.filter(n => {
    if (!n.roles.includes(user.role)) return false;
    if (user.role === 'admin') return true;
    if (rolePerms && rolePerms[user.role]) {
      const sectionPerms = rolePerms[user.role][n.id];
      if (sectionPerms === undefined) {
        return ROLE_DEFAULTS[user.role]?.includes(n.id) ?? false;
      }
      return !!(typeof sectionPerms === 'object'
        ? Object.values(sectionPerms as Record<string, boolean>).some(Boolean)
        : sectionPerms);
    }
    return ROLE_DEFAULTS[user.role]?.includes(n.id) ?? false;
  });

  // Применяем сохранённый порядок меню для роли
  const roleOrder = navOrder?.[user.role];
  const sortedItems = roleOrder
    ? [...items].sort((a, b) => {
        const ai = roleOrder.indexOf(a.id);
        const bi = roleOrder.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : items;

  return (
    <ExitToPathCtx.Provider value={onExitToPath}>
    <div className="min-h-screen bg-muted/30 flex">
      <AdminSidebar
        sortedItems={sortedItems}
        section={section}
        setSection={setSection}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onExit={onExit}
        socialPending={socialPending}
        newLeadsCount={newLeadsCount}
        setNewLeadsCount={setNewLeadsCount}
        newModerationCount={newModerationCount}
        setNewModerationCount={setNewModerationCount}
      />

      <main className="flex-1 min-w-0 overflow-y-auto h-screen w-full">
        <AdminHeader
          section={section}
          items={items}
          setSidebarOpen={setSidebarOpen}
          onExit={onExit}
          onOpenAi={() => setAiOpen(true)}
        />
        <div className="p-4 lg:p-8">{children}</div>
      </main>

      {aiOpen && (
        <AiChat
          onClose={() => setAiOpen(false)}
          onOpenKnowledge={() => { setAiOpen(false); setSection('vb-knowledge'); }}
        />
      )}

      {idleWarning && (
        <AdminIdleWarning
          secondsLeft={secondsLeft}
          onStay={stayLoggedIn}
        />
      )}
    </div>
    </ExitToPathCtx.Provider>
  );
}