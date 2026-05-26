import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

type TestState = { loading: boolean; status: 'idle' | 'ok' | 'err'; message: string };

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <input type="checkbox" className="w-4 h-4 accent-brand-blue" checked={!!checked} onChange={e => onChange(e.target.checked)} />
    <span className="text-sm">{label}</span>
  </label>
);

export default function NotificationsTab({ s, setS, saved, save }: Props) {
  const [emailTest, setEmailTest] = useState<TestState>({ loading: false, status: 'idle', message: '' });
  const [tgTest, setTgTest] = useState<TestState>({ loading: false, status: 'idle', message: '' });

  const testEmail = async () => {
    setEmailTest({ loading: true, status: 'idle', message: '' });
    try {
      const res = await adminApi.testNotification?.({ channel: 'email' });
      setEmailTest({ loading: false, status: 'ok', message: res?.message || 'Тестовое письмо отправлено' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка отправки';
      setEmailTest({ loading: false, status: 'err', message: msg });
    }
  };

  const testTelegram = async () => {
    setTgTest({ loading: true, status: 'idle', message: '' });
    try {
      const res = await adminApi.testNotification?.({ channel: 'telegram' });
      setTgTest({ loading: false, status: 'ok', message: res?.message || 'Сообщение отправлено' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка отправки';
      setTgTest({ loading: false, status: 'err', message: msg });
    }
  };

  return (
    <div className="space-y-4">
      {/* EMAIL */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Mail" size={18} /> Email-уведомления
            </div>
            {s.notify_email_enabled && s.smtp_host && s.smtp_user ? (
              emailTest.status === 'ok' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Icon name="CheckCircle2" size={11} /> Работает
                </span>
              ) : emailTest.status === 'err' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <Icon name="XCircle" size={11} /> Ошибка
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Icon name="Clock" size={11} /> Настроено, не проверено
                </span>
              )
            ) : s.notify_email_enabled ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <Icon name="AlertTriangle" size={11} /> Нет SMTP
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                <Icon name="Circle" size={11} /> Выключено
              </span>
            )}
          </div>
          <Toggle
            checked={!!s.notify_email_enabled}
            onChange={v => setS({ ...s, notify_email_enabled: v })}
            label="Включено"
          />
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Получатели</label>
          <input
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="admin@company.ru, manager@company.ru"
            value={s.notify_email_recipients || ''}
            onChange={e => setS({ ...s, notify_email_recipients: e.target.value })}
          />
          <div className="text-xs text-muted-foreground mt-1">Несколько адресов через запятую.</div>
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Когда отправлять</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Toggle checked={!!s.notify_email_on_lead} onChange={v => setS({ ...s, notify_email_on_lead: v })} label="Новая заявка" />
            <Toggle checked={!!s.notify_email_on_deal} onChange={v => setS({ ...s, notify_email_on_deal: v })} label="Новая сделка" />
            <Toggle checked={!!s.notify_email_on_complaint} onChange={v => setS({ ...s, notify_email_on_complaint: v })} label="Жалоба" />
          </div>
        </div>

        <details className="border rounded-lg">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold flex items-center gap-2">
            <Icon name="Settings2" size={14} /> SMTP-сервер (для отправки писем)
          </summary>
          <div className="p-3 pt-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Хост</label>
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="smtp.yandex.ru"
                  value={s.smtp_host || ''} onChange={e => setS({ ...s, smtp_host: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Порт</label>
                <input type="number" className="w-full px-3 py-2 border rounded-lg" placeholder="465"
                  value={s.smtp_port ?? ''} onChange={e => setS({ ...s, smtp_port: +e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Логин</label>
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="bot@company.ru"
                  value={s.smtp_user || ''} onChange={e => setS({ ...s, smtp_user: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Пароль</label>
                <input type="password" className="w-full px-3 py-2 border rounded-lg" placeholder="••••••••"
                  value={s.smtp_password || ''} onChange={e => setS({ ...s, smtp_password: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Поле «От» (From)</label>
                <input className="w-full px-3 py-2 border rounded-lg" placeholder="Компания <bot@company.ru>"
                  value={s.smtp_from || ''} onChange={e => setS({ ...s, smtp_from: e.target.value })} />
              </div>
            </div>
          </div>
        </details>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testEmail}
            disabled={emailTest.loading || !s.notify_email_enabled}
            className="px-4 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 disabled:opacity-50"
          >
            {emailTest.loading ? 'Отправка...' : 'Отправить тестовое письмо'}
          </button>
          {emailTest.status === 'ok' && <span className="text-emerald-600 text-sm flex items-center gap-1"><Icon name="CheckCircle2" size={14} /> {emailTest.message}</span>}
          {emailTest.status === 'err' && <span className="text-red-600 text-sm flex items-center gap-1"><Icon name="AlertCircle" size={14} /> {emailTest.message}</span>}
        </div>
      </div>

      {/* TELEGRAM */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Send" size={18} /> Telegram-уведомления
            </div>
            {s.notify_telegram_enabled && s.notify_telegram_bot_token && s.notify_telegram_chat_ids ? (
              tgTest.status === 'ok' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Icon name="CheckCircle2" size={11} /> Работает
                </span>
              ) : tgTest.status === 'err' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <Icon name="XCircle" size={11} /> Ошибка
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Icon name="Clock" size={11} /> Настроено, не проверено
                </span>
              )
            ) : s.notify_telegram_enabled ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <Icon name="AlertTriangle" size={11} /> Нет токена/Chat ID
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                <Icon name="Circle" size={11} /> Выключено
              </span>
            )}
          </div>
          <Toggle
            checked={!!s.notify_telegram_enabled}
            onChange={v => setS({ ...s, notify_telegram_enabled: v })}
            label="Включено"
          />
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Токен бота</label>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            placeholder="1234567890:AAEhBOweik9..."
            value={s.notify_telegram_bot_token || ''}
            onChange={e => setS({ ...s, notify_telegram_bot_token: e.target.value })}
          />
          <div className="text-xs text-muted-foreground mt-1">Создать бота: @BotFather → /newbot → скопировать токен.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Chat ID получателей</label>
          <input
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="123456789, -1001234567890"
            value={s.notify_telegram_chat_ids || ''}
            onChange={e => setS({ ...s, notify_telegram_chat_ids: e.target.value })}
          />
          <div className="text-xs text-muted-foreground mt-1">
            Через запятую. Для личных уведомлений напишите боту /start, затем @userinfobot покажет ваш ID. Для группы — добавьте бота и используйте отрицательный ID.
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Когда отправлять</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Toggle checked={!!s.notify_telegram_on_lead} onChange={v => setS({ ...s, notify_telegram_on_lead: v })} label="Новая заявка" />
            <Toggle checked={!!s.notify_telegram_on_deal} onChange={v => setS({ ...s, notify_telegram_on_deal: v })} label="Новая сделка" />
            <Toggle checked={!!s.notify_telegram_on_complaint} onChange={v => setS({ ...s, notify_telegram_on_complaint: v })} label="Жалоба" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testTelegram}
            disabled={tgTest.loading || !s.notify_telegram_enabled}
            className="px-4 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 disabled:opacity-50"
          >
            {tgTest.loading ? 'Отправка...' : 'Отправить тестовое сообщение'}
          </button>
          {tgTest.status === 'ok' && <span className="text-emerald-600 text-sm flex items-center gap-1"><Icon name="CheckCircle2" size={14} /> {tgTest.message}</span>}
          {tgTest.status === 'err' && <span className="text-red-600 text-sm flex items-center gap-1"><Icon name="AlertCircle" size={14} /> {tgTest.message}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}