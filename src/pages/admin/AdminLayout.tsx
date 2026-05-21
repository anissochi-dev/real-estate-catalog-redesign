import { ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import AiChat from '@/components/admin/AiChat';
import { adminApi } from '@/lib/adminApi';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;

export type AdminSection = 'dashboard' | 'listings' | 'leads' | 'network-tenants' | 'users' | 'pages' | 'settings' | 'ai-logs'
  | 'crm-owners' | 'crm-kanban' | 'crm-gamification' | 'crm-checks' | 'crm-payments'
  | 'phones' | 'news';

interface Props {
  section: AdminSection;
  setSection: (s: AdminSection) => void;
  onExit: () => void;
  children: ReactNode;
}

const CRM_ROLES = ['admin', 'director', 'broker', 'office_manager', 'manager'];

const NAV: { id: AdminSection; label: string; icon: string; roles: string[]; group?: string }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'LayoutDashboard', roles: ['admin', 'editor', 'manager'] },
  { id: 'listings', label: 'Объекты', icon: 'Building2', roles: ['admin', 'editor', 'manager'] },
  { id: 'leads', label: 'Заявки', icon: 'Inbox', roles: ['admin', 'editor', 'manager'] },
  { id: 'network-tenants', label: 'Сетевики', icon: 'Network', roles: ['admin', 'editor', 'manager'] },
  { id: 'users', label: 'Пользователи', icon: 'Users', roles: ['admin'] },
  { id: 'news', label: 'Новости', icon: 'Newspaper', roles: ['admin', 'editor', 'manager', 'director'] },
  { id: 'pages', label: 'Страницы', icon: 'FileText', roles: ['admin', 'editor'] },
  { id: 'settings', label: 'Настройки', icon: 'Settings', roles: ['admin', 'editor'] },
  { id: 'phones', label: 'Телефонная база', icon: 'Phone', roles: ['admin', 'editor', 'manager'] },
  { id: 'crm-kanban', label: 'Воронка сделок', icon: 'KanbanSquare', roles: CRM_ROLES, group: 'crm' },
  { id: 'crm-gamification', label: 'Рейтинг команды', icon: 'Trophy', roles: CRM_ROLES, group: 'crm' },
  { id: 'crm-checks', label: 'Проверки', icon: 'ShieldCheck', roles: CRM_ROLES, group: 'crm' },
  { id: 'crm-payments', label: 'Платежи', icon: 'CreditCard', roles: CRM_ROLES, group: 'crm' },
];

export default function AdminLayout({ section, setSection, onExit, children }: Props) {
  const { user, logout } = useAuth();
  const [aiOpen, setAiOpen] = useState(false);
  const { state: pushState, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_WARNING_MS / 1000);
  const [rolePerms, setRolePerms] = useState<Record<string, Record<string, boolean>> | null>(null);

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    adminApi.getRolePermissions()
      .then(d => { if (d.permissions) setRolePerms(d.permissions); })
      .catch(() => {});
  }, [user]);
  const logoutTimer = useRef<number | null>(null);
  const warningTimer = useRef<number | null>(null);
  const countdownTimer = useRef<number | null>(null);

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

    let lastReset = Date.now();
    const onActivity = () => {
      // Тротлинг: сбрасываем не чаще раза в 5 секунд, чтобы не дёргать таймеры на каждом движении мыши
      const now = Date.now();
      if (now - lastReset < 5000) return;
      lastReset = now;
      resetTimers();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true } as AddEventListenerOptions));
    resetTimers();

    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
  const items = NAV.filter(n => {
    if (!n.roles.includes(user.role)) return false;
    if (user.role === 'admin') return true;
    if (!rolePerms || !rolePerms[user.role]) return true;
    const sectionPerms = rolePerms[user.role][n.id];
    if (sectionPerms === undefined) return true;
    return !!(typeof sectionPerms === 'object'
      ? Object.values(sectionPerms as Record<string, boolean>).some(Boolean)
      : sectionPerms);
  });

  const roleLabel: Record<string, string> = {
    admin: 'Администратор',
    editor: 'Редактор',
    manager: 'Менеджер',
    client: 'Клиент',
    broker: 'Брокер',
    office_manager: 'Офис-менеджер',
    director: 'Директор',
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-border z-40 flex flex-col transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <div className="font-display font-700 text-sm text-brand-blue leading-tight">Бизнес. Маркетинг. Недвижимость.</div>
            <div className="text-xs text-muted-foreground">Админ-панель</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <Icon name="X" size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.filter(n => !n.group).map(item => (
            <button
              key={item.id}
              onClick={() => { setSection(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                section === item.id ? 'bg-brand-blue text-white font-semibold' : 'text-foreground hover:bg-muted'
              }`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
          {items.some(n => n.group === 'crm') && (
            <>
              <div className="pt-3 pb-1 px-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CRM</div>
              </div>
              {items.filter(n => n.group === 'crm').map(item => (
                <button
                  key={item.id}
                  onClick={() => { setSection(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                    section === item.id ? 'bg-brand-blue text-white font-semibold' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="shrink-0 p-3 border-t border-border bg-white">
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

      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        <header className="bg-white border-b border-border px-4 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Icon name="Menu" size={22} />
            </button>
            <h1 className="font-display font-700 text-xl">
              {items.find(n => n.id === section)?.label || 'Админ-панель'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Push-уведомления — ключи генерируются автоматически на сервере */}
            {pushState !== 'unsupported' && (
              <div className="relative group">
                <button
                  onClick={pushState === 'subscribed' ? pushUnsubscribe : pushSubscribe}
                  disabled={pushState === 'loading' || pushState === 'denied'}
                  className={`p-2 rounded-xl border transition relative ${
                    pushState === 'subscribed'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                      : pushState === 'denied'
                      ? 'border-red-200 bg-red-50 text-red-400 cursor-not-allowed opacity-60'
                      : 'border-border bg-white hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {pushState === 'loading'
                    ? <Icon name="Loader2" size={16} className="animate-spin" />
                    : pushState === 'subscribed'
                    ? <Icon name="BellRing" size={16} />
                    : <Icon name="BellOff" size={16} />
                  }
                  {pushState === 'subscribed' && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                  )}
                </button>
                {/* Тултип */}
                <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                  {pushState === 'subscribed' && (
                    <><div className="font-semibold text-emerald-400 mb-1">✓ Уведомления включены</div>
                    <div className="text-gray-300">Вы будете получать уведомления о новых заявках. Нажмите чтобы отключить.</div></>
                  )}
                  {pushState === 'denied' && (
                    <><div className="font-semibold text-red-400 mb-1">✗ Уведомления заблокированы</div>
                    <div className="text-gray-300">Браузер запретил уведомления. Разрешите их: откройте настройки браузера → Конфиденциальность → Уведомления → найдите этот сайт и разрешите.</div></>
                  )}
                  {pushState === 'unsubscribed' && (
                    <><div className="font-semibold text-gray-200 mb-1">Уведомления отключены</div>
                    <div className="text-gray-300">Нажмите чтобы получать уведомления о новых заявках с сайта.</div></>
                  )}
                  {pushState === 'loading' && (
                    <div className="text-gray-300">Проверка статуса уведомлений...</div>
                  )}
                </div>
              </div>
            )}
            {(user.role === 'admin' || user.role === 'editor' || user.role === 'manager') && (
              <button
                onClick={() => setAiOpen(true)}
                className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
              >
                <Icon name="Sparkles" size={16} />
                <span className="hidden sm:inline">ИИ-ассистент</span>
              </button>
            )}
          </div>
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