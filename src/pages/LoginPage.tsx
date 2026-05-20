import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

export default function LoginPage({ onSuccess, onBack }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, name, phone });
      }
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: string) => {
    setEmail(`${role}@biznest.ru`);
    setPassword('admin123');
    setMode('login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-blue via-brand-blue-dark to-brand-blue flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <button
          onClick={onBack}
          className="text-white/80 hover:text-white mb-6 inline-flex items-center gap-2 text-sm"
        >
          <Icon name="ArrowLeft" size={16} /> На сайт
        </button>

        <div className="bg-white rounded-3xl p-8 shadow-2xl animate-fade-in">
          <div className="text-center mb-6">
            <div className="font-display font-700 text-xl text-brand-blue leading-tight">Бизнес. Маркетинг. Недвижимость.</div>
            <div className="text-xs text-muted-foreground mt-1">Личный кабинет</div>
          </div>

          <div className="flex gap-2 p-1 bg-muted rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                mode === 'login' ? 'bg-white shadow text-brand-blue' : 'text-muted-foreground'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                mode === 'register' ? 'bg-white shadow text-brand-blue' : 'text-muted-foreground'
              }`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Ваше имя"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-input focus:border-brand-blue outline-none transition"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-input focus:border-brand-blue outline-none transition"
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl border border-input focus:border-brand-blue outline-none transition"
            />
            {mode === 'register' && (
              <input
                type="tel"
                placeholder="Телефон (необязательно)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-input focus:border-brand-blue outline-none transition"
              />
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-blue text-white py-3 rounded-xl font-semibold font-display disabled:opacity-50"
            >
              {loading ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2 text-center">Демо-аккаунты (пароль: admin123):</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { role: 'admin', label: 'Админ' },
                  { role: 'editor', label: 'Редактор' },
                  { role: 'manager', label: 'Менеджер' },
                  { role: 'client', label: 'Клиент' },
                ].map(r => (
                  <button
                    key={r.role}
                    onClick={() => fillDemo(r.role)}
                    className="text-xs py-2 px-3 rounded-lg bg-muted hover:bg-brand-blue/10 hover:text-brand-blue transition"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}