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
  sidebarOpen, setSidebarOpen,
  onExit,
  socialPending, newLeadsCount, setNewLeadsCount,
  newModerationCount, setNewModerationCount,
}: Props) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const close = () => setSidebarOpen(false);

  return (
    <>
      {/* Затемнение фона */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={close}
        />
      )}

      {/* Боковая панель */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 bg-white border-r border-border z-50 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Заголовок */}
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <a
              href="/"
              onClick={close}
              className="font-display font-700 text-sm text-brand-blue leading-tight hover:underline flex items-center gap-1"
            >
              Бизнес. Маркетинг. Недвижимость.
              <Icon name="ExternalLink" size={12} className="opacity-60 shrink-0" />
            </a>
            <div className="text-xs text-muted-foreground mt-0.5">{user.name} · {roleLabel[user.role]}</div>
          </div>
          <button onClick={close} className="p-1 rounded hover:bg-muted transition">
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto space-y-1 p-3">
          {sortedItems.map(item => {
            const badge =
              item.id === 'marketing'  && socialPending > 0       ? socialPending
              : item.id === 'leads'    && newLeadsCount > 0        ? newLeadsCount
              : item.id === 'listings' && newModerationCount > 0   ? newModerationCount
              : 0;
            const badgeColor =
              item.id === 'leads'      ? 'bg-red-500'
              : item.id === 'listings' ? 'bg-amber-500'
              : 'bg-amber-500';
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSection(item.id);
                  close();
                  if (item.id === 'leads')    setNewLeadsCount(0);
                  if (item.id === 'listings') setNewModerationCount(0);
                }}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                  isActive ? 'bg-brand-blue text-white font-semibold' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="relative flex-shrink-0">
                  <Icon name={item.icon} size={18} />
                  {item.id === 'leads' && newLeadsCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" />
                  )}
                  {item.id === 'listings' && newModerationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping opacity-75" />
                  )}
                </span>
                {item.label}
                {badge > 0 && (
                  <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                    isActive ? 'bg-white/20 text-white' : `${badgeColor} text-white`
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Футер */}
        <div className="shrink-0 border-t border-border bg-white p-3">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition"
          >
            <Icon name="LogOut" size={16} />
            Выйти
          </button>
        </div>
      </aside>
    </>
  );
}