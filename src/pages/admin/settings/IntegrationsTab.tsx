import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S, PingState } from './types';
import { CRM_CHECKS_URL, getToken } from '@/lib/adminApi';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  showMapsKey: boolean;
  setShowMapsKey: (v: boolean) => void;
  showYkSecret: boolean;
  setShowYkSecret: (v: boolean) => void;
  pingState: PingState;
  mapsState: PingState;
  ykState: PingState;
  testConnection: () => void;
  testMapsKey: () => void;
  testYookassa: () => void;
}

type CheckState = { loading: boolean; status: 'idle' | 'ok' | 'err'; message: string };
const idle: CheckState = { loading: false, status: 'idle', message: '' };

function ConnBadge({ state, hasKey }: { state: CheckState; hasKey: boolean }) {
  if (state.status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Icon name="CheckCircle2" size={11} /> Подключено
    </span>
  );
  if (state.status === 'err') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <Icon name="XCircle" size={11} /> Ошибка
    </span>
  );
  if (!hasKey) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Circle" size={11} /> Не настроено
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="Clock" size={11} /> Не проверено
    </span>
  );
}

function StatusBanner({ state }: { state: PingState }) {
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

export default function IntegrationsTab({
  s, setS, saved, save,
  showKey, setShowKey, showMapsKey, setShowMapsKey,
  showYkSecret, setShowYkSecret,
  pingState, mapsState, ykState,
  testConnection, testMapsKey, testYookassa,
}: Props) {
  const [zachestnyState, setZachestnyState] = useState<CheckState>(idle);
  const [newdbState, setNewdbState] = useState<CheckState>(idle);
  const [bezopasnoState, setBezopasnoState] = useState<CheckState>(idle);

  const testSecurityKey = async (
    source: 'zachestny' | 'newdb' | 'bezopasno',
    key: string,
    setState: (s: CheckState) => void,
  ) => {
    if (!key.trim()) { setState({ loading: false, status: 'err', message: 'Введите API-ключ' }); return; }
    setState({ loading: true, status: 'idle', message: '' });
    try {
      const r = await fetch(`${CRM_CHECKS_URL}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify({ check_type: 'ping', sources: [source], api_key: key }),
      });
      const d = await r.json();
      const result = d.results?.[source];
      if (!r.ok || result?.error) {
        setState({ loading: false, status: 'err', message: result?.error || d.error || `HTTP ${r.status}` });
      } else {
        setState({ loading: false, status: 'ok', message: result?.message || 'Ключ работает' });
      }
    } catch (e) {
      setState({ loading: false, status: 'err', message: e instanceof Error ? e.message : 'Ошибка' });
    }
  };

  return (
    <div className="space-y-4">

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

      {/* ── Яндекс.Карты ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Map" size={18} className="text-brand-blue" />
          Яндекс.Карты
        </div>
        <p className="text-sm text-muted-foreground">
          Ключ для отображения карты с объектами на странице «Карта» и в карточках объектов.
        </p>

        <div>
          <label className="text-sm font-semibold block mb-1">API-ключ Яндекс.Карт</label>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
              type={showMapsKey ? 'text' : 'password'}
              placeholder="12345678-abcd-1234-abcd-1234567890ab"
              value={s.yandex_maps_api_key || ''}
              onChange={e => setS({ ...s, yandex_maps_api_key: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowMapsKey(!showMapsKey)}
              className="px-3 py-2 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-1"
            >
              <Icon name={showMapsKey ? 'EyeOff' : 'Eye'} size={14} />
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            developer.tech.yandex.ru → подключить сервис <b>JavaScript API и Геокодер</b>
          </div>
        </div>

        <StatusBanner state={mapsState} />

        <button
          onClick={testMapsKey}
          disabled={mapsState.loading || !s.yandex_maps_api_key}
          className="px-5 py-2.5 rounded-xl border-2 border-brand-blue text-brand-blue font-semibold inline-flex items-center gap-2 hover:bg-brand-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {mapsState.loading ? (
            <><div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />Проверяем...</>
          ) : (
            <><Icon name="Plug" size={14} />Проверить ключ карт</>
          )}
        </button>
      </div>

      {/* ── ЮКасса ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="CreditCard" size={18} className="text-brand-blue" />
          ЮКасса (YooKassa)
        </div>
        <p className="text-sm text-muted-foreground">
          Ключи для приёма оплаты: генерация ссылок на задаток и брокерское вознаграждение.
        </p>

        <div>
          <label className="text-sm font-semibold block mb-1">Shop ID (ID магазина)</label>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            type="text"
            placeholder="123456"
            value={s.yookassa_shop_id || ''}
            onChange={e => setS({ ...s, yookassa_shop_id: e.target.value })}
          />
          <div className="text-xs text-muted-foreground mt-1">
            yookassa.ru → Интеграция → HTTP API → <b>shopId</b> (числовой ID)
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Secret Key (секретный ключ)</label>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
              type={showYkSecret ? 'text' : 'password'}
              placeholder="test_AbCdEf... или live_AbCdEf..."
              value={s.yookassa_secret_key || ''}
              onChange={e => setS({ ...s, yookassa_secret_key: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowYkSecret(!showYkSecret)}
              className="px-3 py-2 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-1"
            >
              <Icon name={showYkSecret ? 'EyeOff' : 'Eye'} size={14} />
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            yookassa.ru → Интеграция → HTTP API → <b>Секретный ключ</b>. Начинается с <code className="bg-muted px-1 rounded">test_</code> (тест) или <code className="bg-muted px-1 rounded">live_</code> (боевой)
          </div>
        </div>

        {s.yookassa_secret_key && !s.yookassa_secret_key.startsWith('test_') && !s.yookassa_secret_key.startsWith('live_') && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <Icon name="AlertTriangle" size={14} className="flex-shrink-0 mt-0.5" />
            <div>Ключ не начинается с <b>test_</b> или <b>live_</b> — возможно, введён некорректный ключ.</div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
          <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            Ключи хранятся в защищённой БД. Вебхук для уведомлений об оплате:<br />
            <code className="bg-blue-100 px-1 rounded break-all">
              https://functions.poehali.dev/74ca5694-a05f-4053-992d-5e04bc5bc7a4/?action=webhook
            </code>
          </div>
        </div>

        <StatusBanner state={ykState} />

        <button
          onClick={testYookassa}
          disabled={ykState.loading || !s.yookassa_shop_id || !s.yookassa_secret_key}
          className="px-5 py-2.5 rounded-xl border-2 border-brand-blue text-brand-blue font-semibold inline-flex items-center gap-2 hover:bg-brand-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {ykState.loading ? (
            <><div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />Проверяем...</>
          ) : (
            <><Icon name="Plug" size={14} />Проверить подключение к ЮКассе</>
          )}
        </button>
      </div>

      {/* ── Проверка безопасности ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="ShieldCheck" size={18} className="text-brand-blue" />
          Проверка безопасности
        </div>
        <p className="text-sm text-muted-foreground">
          API-ключи для проверки компаний, собственников и недвижимости во вкладке «Проверки» CRM.
        </p>

        <div className="space-y-3">
          {/* ЧестныйБизнес */}
          <div className={`rounded-xl border p-4 space-y-2 ${zachestnyState.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30' : zachestnyState.status === 'err' ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">ЧестныйБизнес</span>
                <span className="text-xs text-muted-foreground">Проверка компаний и ИП по ИНН</span>
              </div>
              <ConnBadge state={zachestnyState} hasKey={!!s.zachestny_api_key} />
            </div>
            <input
              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
              type="password"
              placeholder="Введите API-ключ zachestnyibiznesapi.ru"
              value={s.zachestny_api_key || ''}
              onChange={e => { setS({ ...s, zachestny_api_key: e.target.value }); setZachestnyState(idle); }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                Получить: <a href="https://zachestnyibiznesapi.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">zachestnyibiznesapi.ru</a> → Личный кабинет → API-ключ
              </div>
              <button
                type="button"
                onClick={() => testSecurityKey('zachestny', s.zachestny_api_key || '', setZachestnyState)}
                disabled={zachestnyState.loading || !s.zachestny_api_key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40 shrink-0"
              >
                {zachestnyState.loading ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверка...</> : <><Icon name="Zap" size={12} /> Проверить ключ</>}
              </button>
            </div>
            {zachestnyState.status !== 'idle' && (
              <div className={`text-xs flex items-center gap-1.5 ${zachestnyState.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
                <Icon name={zachestnyState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={12} />
                {zachestnyState.message}
              </div>
            )}
          </div>

          {/* NewDB */}
          <div className={`rounded-xl border p-4 space-y-2 ${newdbState.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30' : newdbState.status === 'err' ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">NewDB</span>
                <span className="text-xs text-muted-foreground">Физлица и телефоны</span>
              </div>
              <ConnBadge state={newdbState} hasKey={!!s.newdb_api_key} />
            </div>
            <input
              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
              type="password"
              placeholder="Введите token newdb.net"
              value={s.newdb_api_key || ''}
              onChange={e => { setS({ ...s, newdb_api_key: e.target.value }); setNewdbState(idle); }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                Получить: <a href="https://newdb.net" target="_blank" rel="noreferrer" className="text-brand-blue underline">newdb.net</a> → Регистрация → API токен
              </div>
              <button
                type="button"
                onClick={() => testSecurityKey('newdb', s.newdb_api_key || '', setNewdbState)}
                disabled={newdbState.loading || !s.newdb_api_key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40 shrink-0"
              >
                {newdbState.loading ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверка...</> : <><Icon name="Zap" size={12} /> Проверить ключ</>}
              </button>
            </div>
            {newdbState.status !== 'idle' && (
              <div className={`text-xs flex items-center gap-1.5 ${newdbState.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
                <Icon name={newdbState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={12} />
                {newdbState.message}
              </div>
            )}
          </div>

          {/* Безопасно.org */}
          <div className={`rounded-xl border p-4 space-y-2 ${bezopasnoState.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30' : bezopasnoState.status === 'err' ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Безопасно.org</span>
                <span className="text-xs text-muted-foreground">Комплексная проверка</span>
              </div>
              <ConnBadge state={bezopasnoState} hasKey={!!s.bezopasno_api_key} />
            </div>
            <input
              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
              type="password"
              placeholder="Введите API-ключ bezopasno.org"
              value={s.bezopasno_api_key || ''}
              onChange={e => { setS({ ...s, bezopasno_api_key: e.target.value }); setBezopasnoState(idle); }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                Получить: <a href="https://bezopasno.org" target="_blank" rel="noreferrer" className="text-brand-blue underline">bezopasno.org</a> → API → Ключ доступа
              </div>
              <button
                type="button"
                onClick={() => testSecurityKey('bezopasno', s.bezopasno_api_key || '', setBezopasnoState)}
                disabled={bezopasnoState.loading || !s.bezopasno_api_key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40 shrink-0"
              >
                {bezopasnoState.loading ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверка...</> : <><Icon name="Zap" size={12} /> Проверить ключ</>}
              </button>
            </div>
            {bezopasnoState.status !== 'idle' && (
              <div className={`text-xs flex items-center gap-1.5 ${bezopasnoState.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
                <Icon name={bezopasnoState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={12} />
                {bezopasnoState.message}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
          <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
          <div>Ключи хранятся в защищённой БД и используются только на сервере. Подключите хотя бы один сервис — остальные можно добавить позже.</div>
        </div>
      </div>

      {/* ── Инструменты вебмастера ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="SearchCheck" size={18} className="text-brand-blue" />
          Инструменты вебмастера
        </div>
        <p className="text-sm text-muted-foreground">
          Коды подтверждения для подключения сайта к поисковым системам — позволяют видеть статистику индексации, ошибки и позиции в поиске.
        </p>

        {/* Яндекс Вебмастер */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс Вебмастер</span>
            <span className="text-xs text-muted-foreground">Статистика индексации в Яндексе</span>
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
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

        {/* Google Search Console */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Google Search Console</span>
            <span className="text-xs text-muted-foreground">Позиции и индексация в Google</span>
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
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

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
          <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
          <div>После сохранения мета-теги автоматически появятся в коде сайта. Нажмите «Проверить» в вебмастере через 1–2 минуты после сохранения.</div>
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
    </div>
  );
}