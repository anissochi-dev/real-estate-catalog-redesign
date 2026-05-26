import Icon from '@/components/ui/icon';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

export default function IntegrationsWebmasterSection({ s, setS, saved, save }: Props) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="SearchCheck" size={18} className="text-brand-blue" />
        Инструменты вебмастера
      </div>
      <p className="text-sm text-muted-foreground">
        Коды подтверждения для подключения сайта к поисковым системам — позволяют видеть статистику индексации, ошибки и позиции в поиске.
      </p>

      {/* ── Яндекс Вебмастер ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс Вебмастер</span>
          <span className="text-xs text-muted-foreground">Статистика индексации в Яндексе</span>
        </div>

        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="Например: 1234567890abcdef"
          value={s.yandex_webmaster_verification || ''}
          onChange={e => setS({ ...s, yandex_webmaster_verification: e.target.value })}
        />

        <div className="text-xs text-muted-foreground">
          <a href="https://webmaster.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">webmaster.yandex.ru</a>
          {' '}→ Добавить сайт → Проверка прав → вкладка <b>«Мета-тег»</b> → скопируйте значение атрибута <code className="bg-muted px-1 rounded">content=""</code>
        </div>
      </div>

      {/* ── Google Search Console ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Google Search Console</span>
          <span className="text-xs text-muted-foreground">Позиции и индексация в Google</span>
        </div>

        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="Например: AbCdEfGhIjKlMnOpQrSt_1234"
          value={s.google_search_console_verification || ''}
          onChange={e => setS({ ...s, google_search_console_verification: e.target.value })}
        />

        <div className="text-xs text-muted-foreground">
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-brand-blue underline">search.google.com/search-console</a>
          {' '}→ Добавить ресурс → HTML-тег → скопируйте значение атрибута <code className="bg-muted px-1 rounded">content=""</code>
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20 flex-wrap">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">
          Сохранить
        </button>
        {saved && (
          <span className="text-emerald-600 text-sm flex items-center gap-1">
            <Icon name="CheckCircle2" size={14} /> Сохранено
          </span>
        )}
      </div>
    </div>
  );
}