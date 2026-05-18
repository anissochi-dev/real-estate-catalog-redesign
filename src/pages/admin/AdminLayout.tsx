import { ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import AiChat from '@/components/admin/AiChat';

const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;

export type AdminSection = 'dashboard' | 'listings' | 'leads' | 'users' | 'pages' | 'settings' | 'ai-logs';

interface Props {
  section: AdminSection;
  setSection: (s: AdminSection) => void;
  onExit: () => void;
  children: ReactNode;
}

const NAV: { id: AdminSection; label: string; icon: string; roles: string[] }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'LayoutDashboard', roles: ['admin', 'editor', 'manager'] },
  { id: 'listings', label: 'Объявления', icon: 'Building2', roles: ['admin', 'editor', 'manager'] },
  { id: 'leads', label: 'Лиды', icon: 'Inbox', roles: ['admin', 'editor', 'manager'] },
  { id: 'users', label: 'Пользователи', icon: 'Users', roles: ['admin'] },
  { id: 'pages', label: 'Страницы', icon: 'FileText', roles: ['admin', 'editor'] },
  { id: 'settings', label: 'Настройки', icon: 'Settings', roles: ['admin', 'editor'] },
];

export default function AdminLayout({ section, setSection, onExit, children }: Props) {
  const { user, logout } = useAuth();
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_WARNING_MS / 1000);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    const clearAll = () => {
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };

    const resetTimers = () => {
      clearAll();
      setIdleWarning(false);
      warningTimer.current = setTimeout(() => {
        setIdleWarning(true);
        setSecondsLeft(IDLE_WARNING_MS / 1000);
        countdownTimer.current = setInterval(() => {
          setSecondsLeft(s => (s > 1 ? s - 1 : 0));
        }, 1000);
      }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
      logoutTimer.current = setTimeout(() => {
        clearAll();
        logout();
      }, IDLE_TIMEOUT_MS);
    };

    const onActivity = () => {
      if (!idleWarning) resetTimers();
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    resetTimers();

    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, idleWarning]);

  const stayLoggedIn = () => {
    setIdleWarning(false);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    warningTimer.current = setTimeout(() => {
      setIdleWarning(true);
      setSecondsLeft(IDLE_WARNING_MS / 1000);
      countdownTimer.current = setInterval(() => {
        setSecondsLeft(s => (s > 1 ? s - 1 : 0));
      }, 1000);
    }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
    logoutTimer.current = setTimeout(() => logout(), IDLE_TIMEOUT_MS);
  };

  if (!user) return null;
  const items = NAV.filter(n => n.roles.includes(user.role));

  const roleLabel: Record<string, string> = {
    admin: 'Администратор',
    editor: 'Редактор',
    manager: 'Менеджер',
    client: 'Клиент',
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-border z-40 transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-display font-700 text-xl text-brand-blue">BIZNEST</div>
            <div className="text-xs text-muted-foreground">Админ-панель</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <Icon name="X" size={20} />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setSection(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                section === item.id
                  ? 'bg-brand-blue text-white font-semibold'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border bg-white">
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-semibold truncate">{user.name}</div>
            <div className="text-xs text-muted-foreground">{roleLabel[user.role]}</div>
          </div>
          <button
            onClick={onExit}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-muted transition"
          >
            <Icon name="ExternalLink" size={16} />
            На сайт
          </button>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition"
          >
            <Icon name="LogOut" size={16} />
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-border px-4 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Icon name="Menu" size={22} />
            </button>
            <h1 className="font-display font-700 text-xl">
              {items.find(n => n.id === section)?.label || 'Админ-панель'}
            </h1>
          </div>
          {(user.role === 'admin' || user.role === 'editor' || user.role === 'manager') && (
            <button
              onClick={() => setAiOpen(true)}
              className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              <Icon name="Sparkles" size={16} />
              <span className="hidden sm:inline">ИИ-ассистент</span>
            </button>
          )}
        </header>
        <div className="p-4 lg:p-8">{children}</div>
      </main>

      {aiOpen && <AiChat onClose={() => setAiOpen(false)} />}

      {idleWarning && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in-up">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <Icon name="Clock" size={22} className="text-amber-600" />
            </div>
            <h2 className="font-display font-700 text-lg mb-1">Вы здесь?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Из-за бездействия сессия будет завершена через <span className="font-semibold text-foreground">{secondsLeft} сек</span>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => logout()}
                className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
              >
                Выйти
              </button>
              <button
                onClick={stayLoggedIn}
                className="flex-1 btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
              >
                Остаться в админке
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}