import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';

export default function DeclinedPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const phone = settings.company_phone;
  const email = settings.company_email;
  const company = settings.company_name || 'BIZNEST';

  const handleRetry = () => {
    try {
      localStorage.removeItem('biznest_consent_v1');
    } catch {
      // ignore
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md w-full">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
          <Icon name="ShieldOff" size={32} className="text-muted-foreground" />
        </div>
        <h1 className="font-display font-800 text-2xl text-foreground mb-3">Доступ ограничен</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          Вы отказались от принятия условий использования сайта. Без согласия с политикой конфиденциальности и
          использованием файлов cookie мы не можем предоставить вам доступ к сервису.
        </p>

        <div className="bg-muted/40 rounded-xl p-4 mb-6 text-sm text-foreground/70 space-y-1.5">
          <p>Если вы хотите пересмотреть своё решение — нажмите кнопку ниже.</p>
          <p>Если у вас есть вопросы — свяжитесь с нами напрямую.</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleRetry}
            className="w-full btn-blue text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Icon name="RefreshCw" size={16} />
            Пересмотреть условия
          </button>

          {(phone || email) && (
            <div className="flex flex-col sm:flex-row gap-2">
              {phone && (
                <a href={`tel:${phone}`}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
                  <Icon name="Phone" size={16} />
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border border-border text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
                  <Icon name="Mail" size={16} />
                  {email}
                </a>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-6">{company}</p>
      </div>
    </div>
  );
}
