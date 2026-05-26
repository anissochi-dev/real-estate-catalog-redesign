import Icon from '@/components/ui/icon';
import { S, PingState } from './types';

interface StatusBannerProps { state: PingState }
export function StatusBanner({ state }: StatusBannerProps) {
  if (state.status === 'idle') return null;
  return (
    <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
      state.status === 'ok'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
        : 'bg-red-50 border-red-200 text-red-900'
    }`}>
      <Icon
        name={state.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'}
        size={16}
        className="flex-shrink-0 mt-0.5"
      />
      <div>{state.message}</div>
    </div>
  );
}

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  pingState: PingState;
  testConnection: () => void;
}

export default function IntegrationsAiSection({
  s, setS, saved, save,
  showKey, setShowKey,
  pingState, testConnection,
}: Props) {
  return (
    <>
      {/* ── YandexGPT ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Sparkles" size={18} className="text-brand-blue" />
          YandexGPT 5 Pro (Алиса)
        </div>
        <p className="text-sm text-muted-foreground">
          Ключи для работы ИИ-подбора, генерации описаний, ответов на лиды и SEO. Получить можно в Yandex Cloud Console.
        </p>

        <div>
          <label className="text-sm font-semibold block mb-1">API-ключ YandexGPT</label>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
              type={showKey ? 'text' : 'password'}
              placeholder="AQVN..."
              value={s.yandex_api_key || ''}
              onChange={e => setS({ ...s, yandex_api_key: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-1"
            >
              <Icon name={showKey ? 'EyeOff' : 'Eye'} size={14} />
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            console.cloud.yandex.ru → Сервисные аккаунты → создать API-ключ с ролью <b>ai.languageModels.user</b>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">ID каталога (Folder ID)</label>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            placeholder="b1g..."
            value={s.yandex_folder_id || ''}
            onChange={e => setS({ ...s, yandex_folder_id: e.target.value })}
          />
          <div className="text-xs text-muted-foreground mt-1">
            ID каталога Yandex Cloud, в котором создан сервисный аккаунт (например, b1gtl2q...).
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
          <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            Ключи хранятся в защищённой БД и используются только на сервере. На фронт не передаются.
            Если поля оставить пустыми — используются системные ключи проекта (если настроены).
          </div>
        </div>
      </div>

      {/* ── Инструкция Yandex Cloud ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="font-display font-700 text-base mb-3">Как получить ключи Yandex Cloud</div>
        <ol className="space-y-2 text-sm text-foreground list-decimal pl-5">
          <li>Зайти в <a href="https://console.cloud.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">console.cloud.yandex.ru</a></li>
          <li>Скопировать <b>ID каталога</b> из URL или со страницы каталога</li>
          <li>Создать <b>сервисный аккаунт</b> и назначить ему роль <code className="bg-muted px-1 rounded">ai.languageModels.user</code></li>
          <li>У сервисного аккаунта создать <b>API-ключ</b> (не IAM-токен)</li>
          <li>Вставить ключ и Folder ID в поля выше → нажать «Сохранить»</li>
        </ol>
      </div>

      <StatusBanner state={pingState} />

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20 flex-wrap">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">
          Сохранить
        </button>
        <button
          onClick={testConnection}
          disabled={pingState.loading || (!s.yandex_api_key && !s.yandex_folder_id)}
          className="px-5 py-3 rounded-xl border-2 border-brand-blue text-brand-blue font-semibold inline-flex items-center gap-2 hover:bg-brand-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pingState.loading ? (
            <><div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />Проверяем...</>
          ) : (
            <><Icon name="Plug" size={14} />Проверить YandexGPT</>
          )}
        </button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </>
  );
}
