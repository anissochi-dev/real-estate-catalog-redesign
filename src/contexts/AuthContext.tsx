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
    authApi
      .me()
      .then(d => setUser(d.user))
      .catch(() => { clearToken(); setTokenState(''); })
      .finally(() => setLoading(false));
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