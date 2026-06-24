import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import type { AdminSection } from './AdminLayout';

interface NavItem {
  id: AdminSection;
  label: string;
  icon: string;
}

interface Props {
  sortedItems: NavItem[];
  section: AdminSection;
  setSection: (s: AdminSection) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  onExit: () => void;
  socialPending: number;
  newLeadsCount: number;
  setNewLeadsCount: (v: number) => void;
  newModerationCount: number;
  setNewModerationCount: (v: number) => void;
}

const roleLabel: Record<string, string> = {
  admin:          'Администратор',
  editor:         'Редактор',
  manager:        'Менеджер',
  client:         'Клиент',
  broker:         'Брокер',
  office_manager: 'Офис-менеджер',
  director:       'Директор',
};

export default function AdminSidebar({
  sortedItems, section, setSection,
  collapsed, toggleCollapsed,
  sidebarOpen, setSidebarOpen,
  onExit,
  socialPending, newLeadsCount, setNewLeadsCount,
  newModerationCount, setNewModerationCount,
}: Props) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const sidebarWidth = collapsed ? 'w-16' : 'w-64';

  return (
    <aside
      className={`fixed lg:sticky top-0 left-0 h-screen ${sidebarWidth} bg-white border-r border-border z-40 flex flex-col transition-all duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Логотип / заголовок */}
      <div className={`border-b border-border flex items-center shrink-0 ${collapsed ? 'p-3 justify-center' : 'p-6 justify-between'}`}>
        {!collapsed ? (
          <>
            <div>
              <div className="font-display font-700 text-sm text-brand-blue leading-tight">Бизнес. Маркетинг. Недвижимость.</div>
              <div className="text-xs text-muted-foreground">Админ-панель</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
              <Icon name="X" size={20} />
            </button>
          </>
        ) : (
          <Icon name="LayoutDashboard" size={22} className="text-brand-blue" />
        )}
      </div>

      {/* Навигация */}
      <nav className={`flex-1 overflow-y-auto space-y-1 ${collapsed ? 'p-2' : 'p-3'}`}>
        {sortedItems.map(item => {
          const badge =
            item.id === 'marketing'  && socialPending > 0       ? socialPending
            : item.id === 'leads'    && newLeadsCount > 0        ? newLeadsCount
            : item.id === 'listings' && newModerationCount > 0   ? newModerationCount
            : 0;
          const badgeColor =
            item.id === 'leads'     ? 'bg-red-500'
            : item.id === 'listings' ? 'bg-amber-500'
            : 'bg-amber-500';
          const isActive = section === item.id;
          return (
            <button
              key={item.id}
              title={collapsed ? item.label : undefined}
              onClick={() => {
                setSection(item.id);
                setSidebarOpen(false);
                if (item.id === 'leads')    setNewLeadsCount(0);
                if (item.id === 'listings') setNewModerationCount(0);
              }}
              className={`relative w-full flex items-center rounded-xl text-sm transition ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive ? 'bg-brand-blue text-white font-semibold' : 'text-foreground hover:bg-muted'
              }`}
            >
              <span className="relative flex-shrink-0">
                <Icon name={item.icon} size={18} />
                {badge > 0 && collapsed && (
                  <span className={`absolute -top-1 -right-1 w-4 h-4 ${badgeColor} text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {/* Пульсирующий индикатор в collapsed */}
                {item.id === 'leads' && newLeadsCount > 0 && collapsed && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" />
                )}
                {item.id === 'listings' && newModerationCount > 0 && collapsed && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping opacity-75" />
                )}
              </span>
              {!collapsed && item.label}
              {badge > 0 && !collapsed && (
                <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                  isActive ? 'bg-white/20 text-white' : `${badgeColor} text-white`
                }`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
              {/* Пульсирующая точка рядом с текстом (только когда нет числа) */}
              {item.id === 'leads' && newLeadsCount > 0 && !collapsed && badge === 0 && (
                <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Футер: пользователь + свернуть + на сайт + выйти */}
      <div className={`shrink-0 border-t border-border bg-white ${collapsed ? 'p-2' : 'p-3'}`}>
        {!collapsed && (
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-semibold truncate">{user.name}</div>
            <div className="text-xs text-muted-foreground">{roleLabel[user.role]}</div>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          className={`w-full hidden lg:flex items-center rounded-xl text-sm hover:bg-muted transition mb-1 ${
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          }`}
        >
          <Icon name={collapsed ? 'ChevronsRight' : 'ChevronsLeft'} size={16} />
          {!collapsed && 'Свернуть'}
        </button>
        <button
          onClick={onExit}
          title="На сайт"
          className={`w-full flex items-center rounded-xl text-sm hover:bg-muted transition ${
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          }`}
        >
          <Icon name="ExternalLink" size={16} />
          {!collapsed && 'На сайт'}
        </button>
        <button
          onClick={() => logout()}
          title="Выйти"
          className={`w-full flex items-center rounded-xl text-sm text-red-600 hover:bg-red-50 transition ${
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          }`}
        >
          <Icon name="LogOut" size={16} />
          {!collapsed && 'Выйти'}
        </button>
      </div>
    </aside>
  );
}