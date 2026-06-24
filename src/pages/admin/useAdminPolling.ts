import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/adminApi';
import type { AdminSection } from './AdminLayout';

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;

const SOCIAL_PARSER_URL = 'https://functions.poehali.dev/5d1bb364-c893-4d73-a003-e119069371ff';

const ROLE_DEFAULTS: Record<string, string[]> = {
  director:       ['dashboard', 'listings', 'leads', 'news', 'phones', 'users', 'pages', 'settings', 'marketing', 'vb-knowledge', 'crm-kanban', 'crm-gamification', 'crm-checks', 'crm-payments'],
  manager:        ['dashboard', 'listings', 'leads', 'news', 'phones', 'marketing', 'crm-kanban', 'crm-gamification', 'crm-checks', 'crm-payments'],
  editor:         ['dashboard', 'listings', 'leads', 'news', 'phones', 'pages', 'settings', 'seo', 'districts', 'vb-knowledge', 'marketing', 'market-import'],
  broker:         ['dashboard', 'listings', 'leads', 'crm-gamification', 'crm-checks'],
  office_manager: ['dashboard', 'listings', 'leads', 'phones', 'crm-kanban', 'crm-payments'],
  client:         [],
};

export { ROLE_DEFAULTS };

export function useAdminPolling(section: AdminSection) {
  const { user, logout } = useAuth();

  const [socialPending,      setSocialPending]      = useState(0);
  const [newLeadsCount,      setNewLeadsCount]      = useState(0);
  const [newModerationCount, setNewModerationCount] = useState(0);
  const [idleWarning,        setIdleWarning]        = useState(false);
  const [secondsLeft,        setSecondsLeft]        = useState(IDLE_WARNING_MS / 1000);
  const [rolePerms,          setRolePerms]          = useState<Record<string, Record<string, boolean>> | null>(null);
  const [navOrder,           setNavOrder]           = useState<Record<string, string[]> | null>(() => {
    try {
      const cached = localStorage.getItem('biznest_nav_order');
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return null;
  });

  const logoutTimer    = useRef<number | null>(null);
  const warningTimer   = useRef<number | null>(null);
  const countdownTimer = useRef<number | null>(null);

  const loadNavAndPerms = () => {
    if (!user) return;
    Promise.all([
      user.role !== 'admin' ? adminApi.getRolePermissions() : Promise.resolve(null),
      adminApi.getNavOrder(),
    ]).then(([pd, sd]) => {
      if (pd?.permissions) setRolePerms(pd.permissions);
      const rawNav = sd?.settings?.nav_order;
      if (rawNav) {
        try {
          let parsed = typeof rawNav === 'string' ? JSON.parse(rawNav) : rawNav;
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            setNavOrder(parsed);
            try { localStorage.setItem('biznest_nav_order', JSON.stringify(parsed)); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  };

  useEffect(() => {
    loadNavAndPerms();
  }, [user?.role]);

  useEffect(() => {
    const handler = () => loadNavAndPerms();
    window.addEventListener('admin:nav-order-updated', handler);
    return () => window.removeEventListener('admin:nav-order-updated', handler);
  }, [user?.role]);

  // Единый polling — все три счётчика одним интервалом раз в 2 минуты
  useEffect(() => {
    if (!user || user.role === 'client') return;
    const token = localStorage.getItem('admin_token') || '';
    const isAdminDir = ['admin', 'director'].includes(user.role);

    const load = () => {
      const tasks: Promise<void>[] = [
        // Заявки
        adminApi.listLeads()
          .then(d => {
            const cnt = (d.leads || []).filter(
              (l: { status: string }) => l.status === 'new' || l.status === 'pending'
            ).length;
            setNewLeadsCount(section === 'leads' ? 0 : cnt);
          })
          .catch(() => {}),

        // Соцсети
        fetch(SOCIAL_PARSER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
          body: JSON.stringify({ action: 'queue_stats' }),
        })
          .then(r => r.json())
          .then(r => { if (!r.error) setSocialPending(r.total_pending || 0); })
          .catch(() => {}),
      ];

      // Модерация — только admin/director
      if (isAdminDir) {
        tasks.push(
          adminApi.listListings(0, 1, 'moderation')
            .then(d => {
              setNewModerationCount(section === 'listings' ? 0 : (d.counts?.moderation ?? 0));
            })
            .catch(() => {})
        );
      }

      Promise.all(tasks);
    };

    load();
    const interval = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, section]);

  // Idle-таймер
  useEffect(() => {
    if (!user) return;

    const clearAll = () => {
      if (logoutTimer.current)    clearTimeout(logoutTimer.current);
      if (warningTimer.current)   clearTimeout(warningTimer.current);
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
    if (logoutTimer.current)    clearTimeout(logoutTimer.current);
    if (warningTimer.current)   clearTimeout(warningTimer.current);
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

  return {
    socialPending,
    newLeadsCount,      setNewLeadsCount,
    newModerationCount, setNewModerationCount,
    idleWarning,
    secondsLeft,
    rolePerms,
    navOrder,
    stayLoggedIn,
  };
}