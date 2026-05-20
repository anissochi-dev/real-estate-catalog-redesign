import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Icon from '@/components/ui/icon';

export default function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error('404:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="relative mb-8">
          <div className="text-[140px] font-display font-bold text-brand-blue/8 leading-none select-none">404</div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-3xl bg-white shadow-lg border border-border flex items-center justify-center">
              <Icon name="MapPinOff" size={40} className="text-brand-blue" />
            </div>
          </div>
        </div>

        <h1 className="font-display font-bold text-2xl text-foreground mb-2">
          Страница не найдена
        </h1>
        <p className="text-muted-foreground text-sm mb-2">
          Адрес <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{location.pathname}</span> не существует или был удалён.
        </p>
        <p className="text-muted-foreground text-sm mb-8">
          Возможно, вы перешли по устаревшей ссылке.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition"
          >
            <Icon name="ArrowLeft" size={16} />
            Назад
          </button>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center gap-2 btn-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            <Icon name="Home" size={16} />
            На главную
          </button>
          <button
            onClick={() => navigate('/catalog')}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition"
          >
            <Icon name="Building2" size={16} />
            Каталог
          </button>
        </div>
      </div>
    </div>
  );
}
