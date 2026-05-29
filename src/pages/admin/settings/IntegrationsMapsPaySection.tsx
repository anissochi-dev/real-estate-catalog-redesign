import Icon from '@/components/ui/icon';
import { S, PingState } from './types';
import { StatusBanner } from './IntegrationsAiSection';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  showMapsKey: boolean;
  setShowMapsKey: (v: boolean) => void;
  showYkSecret: boolean;
  setShowYkSecret: (v: boolean) => void;
  mapsState: PingState;
  ykState: PingState;
  testMapsKey: () => void;
  testYookassa: () => void;
}

export default function IntegrationsMapsPaySection({
  s, setS,
  showMapsKey, setShowMapsKey,
  showYkSecret, setShowYkSecret,
  mapsState, ykState,
  testMapsKey, testYookassa,
}: Props) {
  return (
    <>
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
            developer.tech.yandex.ru → подключить к ключу: <b>JavaScript API и Геокодер</b> + <b>API Геосаджеста</b> (для подсказок адреса)
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
    </>
  );
}