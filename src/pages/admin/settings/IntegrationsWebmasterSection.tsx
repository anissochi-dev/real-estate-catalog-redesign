import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';

interface Props {
  saved: boolean;
  save: () => void;
}

export default function IntegrationsWebmasterSection({ saved, save }: Props) {
  const { settings } = useSettings();
  const yandexOk = !!settings.yandex_webmaster_verification;
  const googleOk = !!settings.google_search_console_verification;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="SearchCheck" size={18} className="text-brand-blue" />
        Инструменты вебмастера
      </div>
      <p className="text-sm text-muted-foreground">
        Коды подтверждения для подключения сайта к поисковым системам — позволяют видеть статистику индексации, ошибки и позиции в поиске.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Яндекс Вебмастер */}
        <div className={`rounded-xl border p-4 space-y-2 ${yandexOk ? 'border-emerald-200 bg-emerald-50/40' : 'border-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс Вебмастер</span>
            {yandexOk ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <Icon name="CheckCircle2" size={11} /> Подключён
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <Icon name="Circle" size={11} /> Не настроен
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Статистика индексации в Яндексе. Код верификации задаётся разработчиком.
          </p>
          <a href="https://webmaster.yandex.ru" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-blue hover:underline">
            <Icon name="ExternalLink" size={11} /> Открыть Яндекс.Вебмастер
          </a>
        </div>

        {/* Google Search Console */}
        <div className={`rounded-xl border p-4 space-y-2 ${googleOk ? 'border-emerald-200 bg-emerald-50/40' : 'border-border'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Google Search Console</span>
            {googleOk ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <Icon name="CheckCircle2" size={11} /> Подключён
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                <Icon name="Circle" size={11} /> Не настроен
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Позиции и индексация в Google. Код верификации задаётся разработчиком.
          </p>
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-blue hover:underline">
            <Icon name="ExternalLink" size={11} /> Открыть Search Console
          </a>
        </div>
      </div>
    </div>
  );
}
