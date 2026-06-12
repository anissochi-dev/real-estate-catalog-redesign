import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, clearToken, getToken, setToken, User } from '@/lib/adminApi';

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
    authApi
      .me()
      .then(d => setUser(d.user))
      .catch(() => { clearToken(); setTokenState(''); })
      .finally(() => { done = true; clearTimeout(t); setLoading(false); });
    return () => clearTimeout(t);
  }, []);

  // Сбрасываем user когда adminApi получил 401 и очистил токен извне
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setTokenState('');
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