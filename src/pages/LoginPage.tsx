import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

export default function LoginPage({ onSuccess, onBack }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
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

          <form onSubmit={submit} className="space-y-3">
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

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-blue text-white py-3 rounded-xl font-semibold font-display disabled:opacity-50"
            >
              {loading ? 'Подождите...' : 'Войти'}
            </button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Логин и пароль для собственников высланы в мессенджер Макс
          </p>
        </div>
      </div>
    </div>
  );
}