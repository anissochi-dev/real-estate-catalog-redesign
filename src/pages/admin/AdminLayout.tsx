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
  | 'phones' | 'news' | 'vb-knowledge';

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
  { id: 'users', label: 'Пользователи', icon: 'Users', roles: ['admin'] },
  { id: 'news', label: 'Новости', icon: 'Newspaper', roles: ['admin', 'editor', 'manager', 'director'] },
  { id: 'vb-knowledge', label: 'База знаний ВБ', icon: 'Brain', roles: ['admin', 'editor', 'director'] },
  { id: 'settings', label: 'Настройки', icon: 'Settings', roles: ['admin', 'editor'] },
  { id: 'phones', label: 'Телефонная база', icon: 'Phone', roles: ['admin', 'editor', 'manager'] },
  { id: 'crm-kanban', label: 'Воронка сделок', icon: 'KanbanSquare', roles: ['admin', 'director'], group: 'crm' },
  { id: 'crm-gamification', label: 'Рейтинг команды', icon: 'Trophy', roles: CRM_ROLES, group: 'crm' },
  { id: 'crm-checks', label: 'Проверки', icon: 'ShieldCheck', roles: CRM_ROLES, group: 'crm' },
  { id: 'crm-payments', label: 'Платежи', icon: 'CreditCard', roles: CRM_ROLES, group: 'crm' },
];

export default function AdminLayout({ section, setSection, onExit, children }: Props) {
  const { user, logout } = useAuth();
  const [aiOpen, setAiOpen] = useState(false);
  const { state: pushState, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Меню пользователя в мобильной шапке (имя + На сайт + Выйти)
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('biznest_admin_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem('biznest_admin_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
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

  const sidebarWidth = collapsed ? 'w-16' : 'w-64';

  return (
    <div className="min-h-screen bg-muted/30 flex">
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen ${sidebarWidth} bg-white border-r border-border z-40 flex flex-col transition-all duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
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

        <nav className={`flex-1 overflow-y-auto space-y-1 ${collapsed ? 'p-2' : 'p-3'}`}>
          {items.filter(n => !n.group).map(item => (
            <button
              key={item.id}
              title={collapsed ? item.label : undefined}
              onClick={() => { setSection(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center rounded-xl text-sm transition ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                section === item.id ? 'bg-brand-blue text-white font-semibold' : 'text-foreground hover:bg-muted'
              }`}
            >
              <Icon name={item.icon} size={18} />
              {!collapsed && item.label}
            </button>
          ))}
          {items.some(n => n.group === 'crm') && (
            <>
              {!collapsed ? (
                <div className="pt-3 pb-1 px-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CRM</div>
                </div>
              ) : (
                <div className="pt-3 pb-1">
                  <div className="border-t border-border mx-2" />
                </div>
              )}
              {items.filter(n => n.group === 'crm').map(item => (
                <button
                  key={item.id}
                  title={collapsed ? item.label : undefined}
                  onClick={() => { setSection(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center rounded-xl text-sm transition ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                  } ${
                    section === item.id ? 'bg-brand-blue text-white font-semibold' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name={item.icon} size={18} />
                  {!collapsed && item.label}
                </button>
              ))}
            </>
          )}
        </nav>

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

      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        <header className="bg-white border-b border-border px-4 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden" title="Меню">
              <Icon name="Menu" size={22} />
            </button>
            <button onClick={toggleCollapsed} className="hidden lg:inline-flex p-1 rounded hover:bg-muted"
              title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}>
              <Icon name={collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={20} />
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

            {/* Меню пользователя — компактная иконка на мобильном, чтобы было видно
                имя, кнопки «На сайт» и «Выйти». На lg+ сайдбар уже показывает это. */}
            <div className="relative lg:hidden">
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                aria-label="Меню пользователя"
                title={`${user.name} · ${roleLabel[user.role] || user.role}`}
                className="w-10 h-10 rounded-full bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 flex items-center justify-center transition relative"
              >
                <Icon name="User" size={18} />
              </button>
              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
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