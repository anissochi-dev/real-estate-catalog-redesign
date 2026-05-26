import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S, PingState } from './types';
import { adminApi } from '@/lib/adminApi';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

type CheckState = { loading: boolean; status: 'idle' | 'ok' | 'err'; message: string };
const idle: CheckState = { loading: false, status: 'idle', message: '' };

function ConnBadge({ state, hasToken }: { state: CheckState; hasToken: boolean }) {
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
  if (!hasToken) return (
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

export default function IntegrationsMaxSection({ s, setS, saved, save }: Props) {
  const [showToken, setShowToken] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>(idle);

  const testBot = async () => {
    const token = (s.notify_max_bot_token || '').trim();
    if (!token) {
      setCheckState({ loading: false, status: 'err', message: 'Введите токен бота' });
      return;
    }
    setCheckState({ loading: true, status: 'idle', message: '' });
    try {
      const res = await fetch('https://botapi.max.ru/me', {
        headers: { Authorization: token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckState({ loading: false, status: 'err', message: data?.message || data?.description || `HTTP ${res.status}` });
        return;
      }
      const botName = data?.name || data?.username || '—';
      setCheckState({ loading: false, status: 'ok', message: `Бот «${botName}» активен` });
    } catch (e) {
      setCheckState({ loading: false, status: 'err', message: e instanceof Error ? e.message : 'Ошибка соединения' });
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      {/* Заголовок */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="MessageCircle" size={18} className="text-violet-600" />
          MAX (ВКонтакте)
        </div>
        <ConnBadge state={checkState} hasToken={!!s.notify_max_bot_token} />
        <a
          href="https://dev.max.ru/docs-api"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-brand-blue underline inline-flex items-center gap-1 hover:opacity-80"
        >
          <Icon name="ExternalLink" size={12} />
          Документация API
        </a>
      </div>

      <p className="text-sm text-muted-foreground">
        Бот в мессенджере Макс (ВКонтакте) — автоматические уведомления о заявках брокерам и команде.
        Токен выдаётся при создании бота на платформе MAX.
      </p>

      {/* Как создать бота */}
      <details className="border border-border rounded-xl">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold flex items-center gap-2 select-none">
          <Icon name="HelpCircle" size={14} className="text-violet-500" />
          Как создать бота в MAX
        </summary>
        <ol className="px-5 pb-4 pt-2 space-y-1.5 text-sm text-foreground list-decimal">
          <li>Откройте мессенджер <b>Макс</b> и найдите бота <b>@BotMaster</b></li>
          <li>Напишите <code className="bg-muted px-1 rounded">/newbot</code> и следуйте инструкциям</li>
          <li>Укажите имя и username бота</li>
          <li>Скопируйте полученный <b>токен</b> и вставьте ниже</li>
          <li>Каждый брокер должен написать боту <code className="bg-muted px-1 rounded">/start</code> — бот пришлёт его <b>User ID</b></li>
          <li>Укажите User ID каждого сотрудника в разделе <b>Уведомления → Макс</b></li>
        </ol>
      </details>

      {/* Токен бота */}
      <div>
        <label className="text-sm font-semibold block mb-1">Токен бота</label>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm focus:border-violet-400 outline-none"
            type={showToken ? 'text' : 'password'}
            placeholder="Токен из @BotMaster..."
            value={s.notify_max_bot_token || ''}
            onChange={e => { setS({ ...s, notify_max_bot_token: e.target.value }); setCheckState(idle); }}
          />
          <button
            type="button"
            onClick={() => setShowToken(v => !v)}
            className="px-3 py-2 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-1"
          >
            <Icon name={showToken ? 'EyeOff' : 'Eye'} size={14} />
          </button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Токен хранится в защищённой БД и используется только на сервере.
        </div>
      </div>

      {/* Статус проверки */}
      {checkState.status !== 'idle' && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
          checkState.status === 'ok'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
            : 'bg-red-50 border border-red-200 text-red-900'
        }`}>
          <Icon name={checkState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={15} className="mt-0.5 shrink-0" />
          <span>{checkState.message}</span>
        </div>
      )}

      {/* Как получить User ID */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-900">
        <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <b>Как брокеру узнать свой User ID:</b> написать боту команду{' '}
          <code className="bg-violet-100 px-1 rounded">/start</code> — бот пришлёт ID в ответ.
          Этот ID вводится в разделе <b>Настройки → Уведомления → Макс</b> для каждого сотрудника.
        </div>
      </div>

      {/* Кнопки */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <button
          type="button"
          onClick={testBot}
          disabled={checkState.loading || !s.notify_max_bot_token}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-violet-600 text-violet-600 text-sm font-semibold hover:bg-violet-600 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {checkState.loading
            ? <><Icon name="Loader2" size={14} className="animate-spin" /> Проверяем...</>
            : <><Icon name="Zap" size={14} /> Проверить токен</>
          }
        </button>
        <button
          onClick={save}
          className="btn-blue text-white px-5 py-2 rounded-xl font-semibold text-sm"
        >
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
