import { createContext, useEffect, useState, ReactNode } from 'react';
import { authApi, clearToken, getToken, setToken, User, ApiError } from '@/lib/adminApi';

export interface AuthCtx {
  user: User | null;
  token: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => string;
}

export const AuthCtxInstance = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenState, setTokenState] = useState<string>(() => getToken() || '');

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let done = false;
    const t = setTimeout(() => { if (!done) setLoading(false); }, 8000);

    const tryMe = (isRetry = false) => {
      authApi
        .me()
        .then(d => { done = true; clearTimeout(t); setUser(d.user); setLoading(false); })
        .catch((err) => {
          const status = err instanceof ApiError ? err.status : 0;
          const isExpired = status === 401;

          if (!isRetry && !isExpired) {
            // Временная ошибка (rate limit, сеть) — снимаем спиннер, повторяем тихо через 2 сек
            done = true;
            clearTimeout(t);
            setLoading(false);
            setTimeout(() => tryMe(true), 2000);
          } else {
            // Явный 401 — стираем токен. При retry любая ошибка — оставляем токен (сессия не истекла).
            if (isExpired) {
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
    try { await authApi.logout(); } catch { /* ignore */ }
    clearToken();
    setTokenState('');
    setUser(null);
    try { localStorage.removeItem('biznest_admin_section'); } catch { /* ignore */ }
  };

  return (
    <AuthCtxInstance.Provider value={{ user, token: tokenState, loading, login, register, logout, refreshToken }}>
      {children}
    </AuthCtxInstance.Provider>
  );
}

// Реэкспорт — все компоненты импортируют useAuth отсюда
export { useAuth } from './useAuth';