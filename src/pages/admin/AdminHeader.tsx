import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import type { AdminSection } from './AdminLayout';
import ExportRequestsModal from './ExportRequestsModal';

interface NavItem {
  id: AdminSection;
  label: string;
}

interface Props {
  section: AdminSection;
  items: NavItem[];
  setSidebarOpen: (v: boolean) => void;
  onExit: () => void;
  onOpenAi: () => void;
  newExportRequestsCount?: number;
  setNewExportRequestsCount?: (v: number) => void;
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

export default function AdminHeader({
  section, items,
  setSidebarOpen, onExit, onOpenAi,
  newExportRequestsCount = 0, setNewExportRequestsCount,
}: Props) {
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  if (!user) return null;

  const canReviewExports = ['admin', 'director', 'office_manager'].includes(user.role);

  return (
    <header className="bg-white border-b border-border px-4 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1 rounded hover:bg-muted transition"
          title="Меню"
        >
          <Icon name="Menu" size={22} />
        </button>
        <h1 className="font-display font-700 text-xl">
          {items.find(n => n.id === section)?.label || 'Админ-панель'}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {canReviewExports && (
          <button
            onClick={() => setExportModalOpen(true)}
            className="relative p-2 rounded-xl hover:bg-muted transition"
            title="Запросы на платную выгрузку"
          >
            <Icon name="Bell" size={20} />
            {newExportRequestsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {newExportRequestsCount > 99 ? '99+' : newExportRequestsCount}
              </span>
            )}
          </button>
        )}

        {(user.role === 'admin' || user.role === 'editor' || user.role === 'manager') && (
          <button
            onClick={onOpenAi}
            className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
          >
            <Icon name="Sparkles" size={16} />
            <span className="hidden sm:inline">ИИ-ассистент</span>
          </button>
        )}

        {/* Меню пользователя */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            aria-label="Меню пользователя"
            title={`${user.name} · ${roleLabel[user.role] || user.role}`}
            className="w-10 h-10 rounded-full bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 flex items-center justify-center transition"
          >
            <Icon name="User" size={18} />
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 min-w-[220px] bg-white border border-border rounded-xl shadow-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <div className="font-semibold text-sm truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{roleLabel[user.role] || user.role}</div>
                </div>
                <button
                  onClick={() => { setUserMenuOpen(false); onExit(); }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted transition text-left min-h-[44px]"
                >
                  <Icon name="ExternalLink" size={16} className="text-muted-foreground" />
                  На сайт
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition text-left min-h-[44px] border-t border-border"
                >
                  <Icon name="LogOut" size={16} />
                  Выйти
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {exportModalOpen && (
        <ExportRequestsModal
          onClose={() => setExportModalOpen(false)}
          onHandled={() => setNewExportRequestsCount?.(Math.max(0, newExportRequestsCount - 1))}
          onOpenListing={id => {
            setExportModalOpen(false);
            window.dispatchEvent(new CustomEvent('admin:open-listing', { detail: id }));
          }}
        />
      )}
    </header>
  );
}