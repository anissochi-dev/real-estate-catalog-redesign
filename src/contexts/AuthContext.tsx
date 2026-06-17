import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, clearToken, getToken, setToken, User, ApiError } from '@/lib/adminApi';

interface AuthCtx {
  user: User | null;
  token: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => string;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Реактивное состояние токена — чтобы компоненты, читающие useAuth().token,
  // получали актуальное значение, а не undefined.
  const [tokenState, setTokenState] = useState<string>(() => getToken() || '');

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    // Страховка: если проверка авторизации зависнет, через 8 сек снимаем
    // загрузку, чтобы не висело бесконечное колесо.
    let done = false;
    const t = setTimeout(() => { if (!done) setLoading(false); }, 8000);
    const tryMe = (retryDelay?: number) => {
      authApi
        .me()
        .then(d => { done = true; clearTimeout(t); setUser(d.user); setLoading(false); })
        .catch((err) => {
          const status = err instanceof ApiError ? err.status : 0;
          if (status === 503 && retryDelay === undefined) {
            // Rate limit / временная ошибка БД — снимаем спиннер сразу,
            // токен НЕ стираем, повторяем тихо в фоне через 2 сек.
            done = true;
            clearTimeout(t);
            setLoading(false);
            setTimeout(() => tryMe(2000), 2000);
          } else {
            // 401 = сессия истекла — стираем токен.
            // Любая др. ошибка после retry — тоже разлогиниваем.
            if (status !== 503) {
              clearToken();
              setTokenState('');
            }
            done = true;
            clearTimeout(t);
            setLoading(false);
          }
        });
    };
    tryMe();
    return () => clearTimeout(t);
  }, []);

  // Сбрасываем user когда adminApi получил 401 и очистил токен извне
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setTokenState('');
      try { localStorage.removeItem('biznest_admin_section'); } catch { /* ignore */ }
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  const login = async (email: string, password: string) => {
    const d = await authApi.login(email, password);
    setToken(d.token);
    setTokenState(d.token);
    setUser(d.user);
  };

  const register = async (data: { email: string; password: string; name: string; phone?: string }) => {
    const d = await authApi.register(data);
    setToken(d.token);
    setTokenState(d.token);
    setUser(d.user);
  };

  const refreshToken = () => {
    const t = getToken() || '';
    if (t !== tokenState) setTokenState(t);
    return t;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    clearToken();
    setTokenState('');
    setUser(null);
    // Сбрасываем сохранённую секцию админки, чтобы следующий пользователь
    // не наследовал чужой раздел (особенно важно при смене роли)
    try { localStorage.removeItem('biznest_admin_section'); } catch { /* ignore */ }
  };

  return (
    <Ctx.Provider value={{ user, token: tokenState, loading, login, register, logout, refreshToken }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}