import Icon from '@/components/ui/icon';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

export default function IntegrationsAdsSection({ s, setS, saved, save }: Props) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="Megaphone" size={18} className="text-brand-blue" />
        Рекламные интеграции
      </div>
      <p className="text-sm text-muted-foreground">
        Пиксели и коллтрекинг для отслеживания рекламных кампаний. После сохранения скрипты подключатся автоматически.
      </p>

      {/* ── Яндекс.Директ — передача конверсий ──────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс.Директ</span>
            <span className="text-xs text-muted-foreground">Передача конверсий из заявок в Метрику</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setS({ ...s, ya_metrika_goals_enabled: !s.ya_metrika_goals_enabled })}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${s.ya_metrika_goals_enabled ? 'bg-brand-blue' : 'bg-muted-foreground/30'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.ya_metrika_goals_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-muted-foreground">Активно</span>
          </label>
        </div>
        <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <b>Как работает:</b> при каждой новой заявке с сайта в Яндекс.Метрику отправляется цель <code className="bg-white px-1 rounded">lead_form</code>.
          Метрика передаёт эти данные в Директ — алгоритм обучается находить похожих клиентов.
          Требуется: ID счётчика Метрики в разделе SEO выше.
        </div>
      </div>

      {/* ── VK Пиксель ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">VK Пиксель</span>
          <span className="text-xs text-muted-foreground">Ретаргетинг посетителей в VK Ads</span>
        </div>
        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="VK-RTRG-XXXXXXX-XXXXX"
          value={s.vk_pixel_id || ''}
          onChange={e => setS({ ...s, vk_pixel_id: e.target.value })}
        />
        <div className="text-xs text-muted-foreground">
          <a href="https://ads.vk.com" target="_blank" rel="noreferrer" className="text-brand-blue underline">ads.vk.com</a>
          {' '}→ Ретаргетинг → Пиксели → Создать пиксель → скопируйте ID вида <code className="bg-muted px-1 rounded">VK-RTRG-XXXXXXX-XXXXX</code>
        </div>
        {s.vk_pixel_id && (
          <div className="text-xs text-emerald-600 flex items-center gap-1">
            <Icon name="CheckCircle2" size={12} /> Пиксель подключится после сохранения
          </div>
        )}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">VK Ads — Client ID</span>
            <span className="text-xs text-muted-foreground">ID рекламного кабинета</span>
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
            type="text"
            placeholder="Например: 12345678"
            value={s.vk_ads_client_id || ''}
            onChange={e => setS({ ...s, vk_ads_client_id: e.target.value })}
          />
          <div className="text-xs text-muted-foreground">
            <a href="https://ads.vk.com" target="_blank" rel="noreferrer" className="text-brand-blue underline">ads.vk.com</a>
            {' '}→ правый верхний угол → имя аккаунта → <b>ID кабинета</b> (числовой)
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">VK Ads — Client Secret</span>
            <span className="text-xs text-muted-foreground">Секретный ключ приложения</span>
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
            type="password"
            placeholder="••••••••••••••••"
            value={s.vk_ads_client_secret || ''}
            onChange={e => setS({ ...s, vk_ads_client_secret: e.target.value })}
          />
          <div className="text-xs text-muted-foreground">
            <a href="https://ads.vk.com" target="_blank" rel="noreferrer" className="text-brand-blue underline">ads.vk.com</a>
            {' '}→ Настройки → API → <b>Client Secret</b>
          </div>
        </div>
      </div>

      {/* ── CallTouch ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">CallTouch</span>
          <span className="text-xs text-muted-foreground">Коллтрекинг — какой канал даёт звонки</span>
        </div>
        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="Mod ID — например: abc123"
          value={s.calltouch_id || ''}
          onChange={e => setS({ ...s, calltouch_id: e.target.value })}
        />
        <div className="text-xs text-muted-foreground">
          <a href="https://calltouch.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">calltouch.ru</a>
          {' '}→ Настройки сайта → Скрипт → скопируйте Mod ID из строки <code className="bg-muted px-1 rounded">ctw.setModId("abc123")</code>
        </div>
      </div>

      {/* ── Telegram Ads ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Telegram Ads</span>
          <span className="text-xs text-muted-foreground">Пиксель для отслеживания конверсий в Telegram</span>
        </div>
        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="ID пикселя — например: 12345678"
          value={s.telegram_ads_pixel || ''}
          onChange={e => setS({ ...s, telegram_ads_pixel: e.target.value })}
        />
        <div className="text-xs text-muted-foreground">
          <a href="https://ads.telegram.org" target="_blank" rel="noreferrer" className="text-brand-blue underline">ads.telegram.org</a>
          {' '}→ Tracking pixels → Create pixel → скопируйте pixel ID
        </div>
      </div>

      {/* ── МАХ Автоответ ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">МАХ Мессенджер</span>
            <span className="text-xs text-muted-foreground">Автоответ клиенту при отправке заявки</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setS({ ...s, max_autoreply_enabled: !s.max_autoreply_enabled })}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${s.max_autoreply_enabled ? 'bg-brand-blue' : 'bg-muted-foreground/30'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.max_autoreply_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-muted-foreground">Активно</span>
          </label>
        </div>
        <textarea
          className="w-full px-3 py-2 border rounded-lg text-sm focus:border-brand-blue outline-none resize-none"
          rows={3}
          placeholder="Здравствуйте, {name}! Ваша заявка принята. Менеджер свяжется с вами в течение 15 минут."
          value={s.max_autoreply_text || ''}
          onChange={e => setS({ ...s, max_autoreply_text: e.target.value })}
        />
        <div className="text-xs text-muted-foreground">
          Используйте <code className="bg-muted px-1 rounded">{'{name}'}</code> — имя клиента, <code className="bg-muted px-1 rounded">{'{phone}'}</code> — телефон.
          Требуется: токен МАХ Бота в разделе «МАХ Мессенджер» выше.
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