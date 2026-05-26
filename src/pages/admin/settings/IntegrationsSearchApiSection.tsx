import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S } from './types';
import { adminApi } from '@/lib/adminApi';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

type St = 'idle' | 'loading' | 'ok' | 'err';
interface Res { status: St; message: string }
const IDLE: Res = { status: 'idle', message: '' };

function Badge({ value, res }: { value: string; res: Res }) {
  if (!value) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Circle" size={11} /> Не настроено
    </span>
  );
  if (res.status === 'idle') return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="Clock" size={11} /> Не проверено
    </span>
  );
  if (res.status === 'loading') return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Icon name="Loader2" size={11} className="animate-spin" /> Загрузка...
    </span>
  );
  if (res.status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Icon name="CheckCircle2" size={11} /> Подключено
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <Icon name="XCircle" size={11} /> Ошибка
    </span>
  );
}

function ResultBanner({ res }: { res: Res }) {
  if (res.status === 'idle' || res.status === 'loading') return null;
  return (
    <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
      res.status === 'ok'
        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      <Icon name={res.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
      <span>{res.message}</span>
    </div>
  );
}

export default function IntegrationsSearchApiSection({ s, setS, saved, save }: Props) {
  const [showYmToken,  setShowYmToken]  = useState(false);
  const [showGscKey,   setShowGscKey]   = useState(false);

  const [ymCheck,    setYmCheck]    = useState<Res>(IDLE);
  const [ymSubmit,   setYmSubmit]   = useState<Res>(IDLE);
  const [gscCheck,   setGscCheck]   = useState<Res>(IDLE);
  const [gscSubmit,  setGscSubmit]  = useState<Res>(IDLE);

  const call = async (
    action: string,
    setter: (r: Res) => void,
  ) => {
    setter({ status: 'loading', message: '' });
    try {
      const d = await adminApi.webmasterCheck(action) as Record<string, unknown>;
      if (d?.success) {
        setter({ status: 'ok', message: String(d.message || 'Успешно') });
      } else {
        setter({ status: 'err', message: String(d?.error || d?.message || 'Ошибка') });
      }
    } catch (e) {
      setter({ status: 'err', message: e instanceof Error ? e.message : 'Ошибка запроса' });
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
      {/* Заголовок */}
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="Globe" size={18} className="text-brand-blue" />
        API поисковых систем
      </div>
      <p className="text-sm text-muted-foreground">
        Токены для автоматической отправки sitemap.xml в Яндекс Вебмастер и Google Search Console прямо из панели управления.
      </p>

      {/* ── Яндекс Вебмастер OAuth ──────────────────────────────────── */}
      <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
        ymCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
        : ymCheck.status === 'err' ? 'border-red-200 bg-red-50/20'
        : 'border-border'
      }`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс Вебмастер</span>
            <span className="text-xs text-muted-foreground">OAuth-токен</span>
          </div>
          <Badge value={s.yandex_webmaster_token || ''} res={ymCheck} />
        </div>

        {/* Инструкция */}
        <details className="border border-border rounded-lg">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold flex items-center gap-2 select-none">
            <Icon name="HelpCircle" size={12} className="text-brand-blue" /> Как получить OAuth-токен
          </summary>
          <ol className="px-4 pb-3 pt-1 space-y-1 text-xs text-foreground list-decimal">
            <li>Откройте <a href="https://oauth.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">oauth.yandex.ru</a> → «Мои приложения» → «Создать приложение»</li>
            <li>Название произвольное, платформа — <b>Веб-сервисы</b>, Redirect URI — <code className="bg-muted px-1 rounded">https://oauth.yandex.ru/verification_code</code></li>
            <li>В разделе «Доступ» включите <b>Яндекс.Вебмастер → Чтение и запись</b></li>
            <li>Сохраните, скопируйте <b>ID приложения</b> и откройте в браузере:<br/>
              <code className="bg-muted px-1 rounded break-all">https://oauth.yandex.ru/authorize?response_type=token&client_id=ВАШ_ID</code>
            </li>
            <li>Разрешите доступ — получите токен в URL после <code className="bg-muted px-1 rounded">access_token=</code></li>
            <li>Вставьте токен ниже и нажмите «Проверить» — получите User ID</li>
            <li>Сохраните User ID в поле ниже</li>
          </ol>
        </details>

        {/* OAuth-токен */}
        <div>
          <label className="text-xs font-semibold block mb-1">OAuth-токен</label>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
              type={showYmToken ? 'text' : 'password'}
              placeholder="y0_AgAAAA..."
              value={s.yandex_webmaster_token || ''}
              onChange={e => { setS({ ...s, yandex_webmaster_token: e.target.value }); setYmCheck(IDLE); setYmSubmit(IDLE); }}
            />
            <button type="button" onClick={() => setShowYmToken(v => !v)}
              className="px-3 border rounded-lg hover:bg-muted">
              <Icon name={showYmToken ? 'EyeOff' : 'Eye'} size={14} />
            </button>
          </div>
        </div>

        {/* User ID */}
        <div>
          <label className="text-xs font-semibold block mb-1">
            User ID
            <span className="font-normal text-muted-foreground ml-1">(заполняется автоматически после проверки токена)</span>
          </label>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
            type="text"
            placeholder="123456789"
            value={s.yandex_webmaster_user_id || ''}
            onChange={e => setS({ ...s, yandex_webmaster_user_id: e.target.value })}
          />
        </div>

        <ResultBanner res={ymCheck} />
        <ResultBanner res={ymSubmit} />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={ymCheck.status === 'loading' || !s.yandex_webmaster_token}
            onClick={async () => {
              setYmCheck({ status: 'loading', message: '' });
              try {
                const d = await adminApi.webmasterCheck('yandex_check') as Record<string, unknown>;
                if (d?.success) {
                  const uid = String(d.user_id || '');
                  setYmCheck({ status: 'ok', message: String(d.message) });
                  if (uid) setS({ ...s, yandex_webmaster_user_id: uid });
                } else {
                  setYmCheck({ status: 'err', message: String(d?.error || 'Ошибка') });
                }
              } catch (e) {
                setYmCheck({ status: 'err', message: e instanceof Error ? e.message : 'Ошибка' });
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40"
          >
            {ymCheck.status === 'loading'
              ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
              : <><Icon name="Zap" size={12} /> Проверить токен</>}
          </button>

          <button
            type="button"
            disabled={ymSubmit.status === 'loading' || !s.yandex_webmaster_token || !s.yandex_webmaster_user_id}
            onClick={() => call('yandex_submit', setYmSubmit)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40"
          >
            {ymSubmit.status === 'loading'
              ? <><Icon name="Loader2" size={12} className="animate-spin" /> Отправляем...</>
              : <><Icon name="Send" size={12} /> Отправить sitemap</>}
          </button>

          <a href="https://webmaster.yandex.ru" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue">
            <Icon name="ExternalLink" size={12} /> Яндекс Вебмастер
          </a>
        </div>
      </div>

      {/* ── Google Search Console ────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
        gscCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
        : gscCheck.status === 'err' ? 'border-red-200 bg-red-50/20'
        : 'border-border'
      }`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Google Search Console</span>
            <span className="text-xs text-muted-foreground">JSON-ключ сервисного аккаунта</span>
          </div>
          <Badge value={s.google_search_console_key || ''} res={gscCheck} />
        </div>

        {/* Инструкция */}
        <details className="border border-border rounded-lg">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold flex items-center gap-2 select-none">
            <Icon name="HelpCircle" size={12} className="text-blue-600" /> Как получить JSON-ключ Google
          </summary>
          <ol className="px-4 pb-3 pt-1 space-y-1 text-xs text-foreground list-decimal">
            <li>Откройте <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-brand-blue underline">console.cloud.google.com</a> → выберите проект</li>
            <li>API и сервисы → Включённые API → включите <b>Google Search Console API</b></li>
            <li>Учётные данные → «Создать учётные данные» → <b>Сервисный аккаунт</b></li>
            <li>Имя — произвольное. Роль — <b>Владелец</b> (или Редактор)</li>
            <li>Перейдите в созданный аккаунт → Ключи → «Добавить ключ» → <b>JSON</b></li>
            <li>Скачанный файл полностью вставьте в поле ниже</li>
            <li>В <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-brand-blue underline">Search Console</a> → Настройки → Пользователи → добавьте email сервисного аккаунта как <b>Владельца</b></li>
          </ol>
        </details>

        {/* JSON-ключ */}
        <div>
          <label className="text-xs font-semibold block mb-1">JSON-ключ (содержимое файла credentials.json)</label>
          <div className="relative">
            <textarea
              rows={showGscKey ? 6 : 2}
              className="w-full px-3 py-2 border rounded-lg font-mono text-xs focus:border-brand-blue outline-none resize-none"
              placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "..."\n}'}
              value={s.google_search_console_key || ''}
              onChange={e => { setS({ ...s, google_search_console_key: e.target.value }); setGscCheck(IDLE); setGscSubmit(IDLE); }}
            />
            <button type="button" onClick={() => setShowGscKey(v => !v)}
              className="absolute top-2 right-2 px-2 py-1 rounded border bg-white hover:bg-muted text-xs flex items-center gap-1">
              <Icon name={showGscKey ? 'ChevronUp' : 'ChevronDown'} size={12} />
              {showGscKey ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Вставьте полное содержимое JSON-файла. Хранится только на сервере.</div>
        </div>

        <ResultBanner res={gscCheck} />
        <ResultBanner res={gscSubmit} />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={gscCheck.status === 'loading' || !s.google_search_console_key}
            onClick={() => call('google_check', setGscCheck)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40"
          >
            {gscCheck.status === 'loading'
              ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
              : <><Icon name="Zap" size={12} /> Проверить ключ</>}
          </button>

          <button
            type="button"
            disabled={gscSubmit.status === 'loading' || !s.google_search_console_key}
            onClick={() => call('google_submit', setGscSubmit)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40"
          >
            {gscSubmit.status === 'loading'
              ? <><Icon name="Loader2" size={12} className="animate-spin" /> Отправляем...</>
              : <><Icon name="Send" size={12} /> Отправить sitemap</>}
          </button>

          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue">
            <Icon name="ExternalLink" size={12} /> Search Console
          </a>
        </div>
      </div>

      {/* Подсказка */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
        <Icon name="Info" size={14} className="shrink-0 mt-0.5" />
        <div>
          <b>Порядок действий:</b> сначала «Проверить», затем «Отправить sitemap».
          После отправки поисковик поставит сайт в очередь на переобход — обычно 1–3 дня.
        </div>
      </div>

      {/* Кнопка сохранить */}
      <div className="flex items-center gap-3">
        <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl font-semibold text-sm">
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
