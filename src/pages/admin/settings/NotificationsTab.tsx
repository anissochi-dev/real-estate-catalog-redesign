import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { adminApi, User } from '@/lib/adminApi';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

type TestState = { loading: boolean; status: 'idle' | 'ok' | 'err'; message: string };
const idleTest: TestState = { loading: false, status: 'idle', message: '' };

const ROLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'broker',         label: 'Брокер' },
  { id: 'admin',          label: 'Администратор' },
  { id: 'director',       label: 'Директор' },
  { id: 'office_manager', label: 'Офис-менеджер' },
  { id: 'manager',        label: 'Менеджер' },
];

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <input type="checkbox" className="w-4 h-4 accent-brand-blue" checked={!!checked} onChange={e => onChange(e.target.checked)} />
    <span className="text-sm">{label}</span>
  </label>
);

function StatusBadge({ test, enabled, ready }: { test: TestState; enabled: boolean; ready: boolean }) {
  if (!enabled) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Circle" size={11} /> Выключено
    </span>
  );
  if (test.status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Icon name="CheckCircle2" size={11} /> Работает
    </span>
  );
  if (test.status === 'err') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <Icon name="XCircle" size={11} /> Ошибка
    </span>
  );
  if (!ready) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="AlertTriangle" size={11} /> Не настроено
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="Clock" size={11} /> Настроено, не проверено
    </span>
  );
}

export default function NotificationsTab({ s, setS, saved, save }: Props) {
  const [emailTest, setEmailTest]   = useState<TestState>(idleTest);
  const [tgTest,    setTgTest]      = useState<TestState>(idleTest);
  const [maxTest,   setMaxTest]     = useState<TestState>(idleTest);
  const [users,     setUsers]       = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [maxUserIds, setMaxUserIds] = useState<Record<number, string>>({});

  const enabledRoles = (s.notify_max_roles || 'broker,admin,director,office_manager')
    .split(',').map(r => r.trim()).filter(Boolean);

  const toggleRole = (roleId: string) => {
    const current = enabledRoles;
    const next = current.includes(roleId)
      ? current.filter(r => r !== roleId)
      : [...current, roleId];
    setS({ ...s, notify_max_roles: next.join(',') });
  };

  useEffect(() => {
    if (!s.notify_max_enabled) return;
    setUsersLoading(true);
    adminApi.listUsers().then(d => {
      const staff = (d.users as User[]).filter(u =>
        u.role !== 'client' && u.is_active !== false
      );
      setUsers(staff);
      const ids: Record<number, string> = {};
      staff.forEach(u => { ids[u.id] = u.max_user_id || ''; });
      setMaxUserIds(ids);
    }).finally(() => setUsersLoading(false));
  }, [s.notify_max_enabled]);

  const saveMaxUserId = async (userId: number) => {
    await adminApi.updateUser(userId, { max_user_id: maxUserIds[userId] || null });
  };

  const testEmail = async () => {
    setEmailTest({ loading: true, status: 'idle', message: '' });
    try {
      const res = await adminApi.testNotification?.({ channel: 'email' });
      setEmailTest({ loading: false, status: 'ok', message: res?.message || 'Тестовое письмо отправлено' });
    } catch (e: unknown) {
      setEmailTest({ loading: false, status: 'err', message: e instanceof Error ? e.message : 'Ошибка' });
    }
  };

  const testTelegram = async () => {
    setTgTest({ loading: true, status: 'idle', message: '' });
    try {
      const res = await adminApi.testNotification?.({ channel: 'telegram' });
      setTgTest({ loading: false, status: 'ok', message: res?.message || 'Сообщение отправлено' });
    } catch (e: unknown) {
      setTgTest({ loading: false, status: 'err', message: e instanceof Error ? e.message : 'Ошибка' });
    }
  };

  const testMax = async () => {
    setMaxTest({ loading: true, status: 'idle', message: '' });
    try {
      const res = await adminApi.testNotification?.({ channel: 'max' as 'email' });
      setMaxTest({ loading: false, status: 'ok', message: res?.message || 'Тест отправлен' });
    } catch (e: unknown) {
      setMaxTest({ loading: false, status: 'err', message: e instanceof Error ? e.message : 'Ошибка' });
    }
  };

  const visibleUsers = users.filter(u => enabledRoles.includes(u.role));

  return (
    <div className="space-y-4">

      {/* ── EMAIL ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Mail" size={18} /> Email-уведомления
            </div>
            <StatusBadge
              test={emailTest}
              enabled={!!s.notify_email_enabled}
              ready={!!(s.smtp_host && s.smtp_user)}
            />
          </div>
          <Toggle checked={!!s.notify_email_enabled} onChange={v => setS({ ...s, notify_email_enabled: v })} label="Включено" />
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
            <Toggle checked={!!s.notify_email_on_lead}      onChange={v => setS({ ...s, notify_email_on_lead: v })}      label="Новая заявка" />
            <Toggle checked={!!s.notify_email_on_deal}      onChange={v => setS({ ...s, notify_email_on_deal: v })}      label="Новая сделка" />
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
          <button type="button" onClick={testEmail} disabled={emailTest.loading || !s.notify_email_enabled}
            className="px-4 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 disabled:opacity-50">
            {emailTest.loading ? 'Отправка...' : 'Отправить тестовое письмо'}
          </button>
          {emailTest.status === 'ok' && <span className="text-emerald-600 text-sm flex items-center gap-1"><Icon name="CheckCircle2" size={14} /> {emailTest.message}</span>}
          {emailTest.status === 'err' && <span className="text-red-600 text-sm flex items-center gap-1"><Icon name="AlertCircle" size={14} /> {emailTest.message}</span>}
        </div>
      </div>

      {/* ── TELEGRAM ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Send" size={18} /> Telegram-уведомления
            </div>
            <StatusBadge
              test={tgTest}
              enabled={!!s.notify_telegram_enabled}
              ready={!!(s.notify_telegram_bot_token && s.notify_telegram_chat_ids)}
            />
          </div>
          <Toggle checked={!!s.notify_telegram_enabled} onChange={v => setS({ ...s, notify_telegram_enabled: v })} label="Включено" />
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Токен бота</label>
          <input className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            placeholder="1234567890:AAEhBOweik9..."
            value={s.notify_telegram_bot_token || ''}
            onChange={e => setS({ ...s, notify_telegram_bot_token: e.target.value })} />
          <div className="text-xs text-muted-foreground mt-1">Создать бота: @BotFather → /newbot → скопировать токен.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Chat ID получателей</label>
          <input className="w-full px-3 py-2 border rounded-lg"
            placeholder="123456789, -1001234567890"
            value={s.notify_telegram_chat_ids || ''}
            onChange={e => setS({ ...s, notify_telegram_chat_ids: e.target.value })} />
          <div className="text-xs text-muted-foreground mt-1">
            Через запятую. Для личных уведомлений напишите боту /start, затем @userinfobot покажет ваш ID. Для группы — добавьте бота и используйте отрицательный ID.
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Когда отправлять</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Toggle checked={!!s.notify_telegram_on_lead}      onChange={v => setS({ ...s, notify_telegram_on_lead: v })}      label="Новая заявка" />
            <Toggle checked={!!s.notify_telegram_on_deal}      onChange={v => setS({ ...s, notify_telegram_on_deal: v })}      label="Новая сделка" />
            <Toggle checked={!!s.notify_telegram_on_complaint} onChange={v => setS({ ...s, notify_telegram_on_complaint: v })} label="Жалоба" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={testTelegram} disabled={tgTest.loading || !s.notify_telegram_enabled}
            className="px-4 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 disabled:opacity-50">
            {tgTest.loading ? 'Отправка...' : 'Отправить тестовое сообщение'}
          </button>
          {tgTest.status === 'ok' && <span className="text-emerald-600 text-sm flex items-center gap-1"><Icon name="CheckCircle2" size={14} /> {tgTest.message}</span>}
          {tgTest.status === 'err' && <span className="text-red-600 text-sm flex items-center gap-1"><Icon name="AlertCircle" size={14} /> {tgTest.message}</span>}
        </div>
      </div>

      {/* ── МАКС ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="MessageCircle" size={18} className="text-violet-600" />
              Макс-уведомления
            </div>
            <StatusBadge
              test={maxTest}
              enabled={!!s.notify_max_enabled}
              ready={users.some(u => enabledRoles.includes(u.role) && !!u.max_phone) || !!(s.notify_max_extra_phones)}
            />
          </div>
          <Toggle checked={!!s.notify_max_enabled} onChange={v => setS({ ...s, notify_max_enabled: v })} label="Включено" />
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-900">
          <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            Уведомления приходят в мессенджер <b>Макс (ВКонтакте)</b> по номеру телефона. Укажите номер MAX у каждого сотрудника ниже — он может совпадать с рабочим или быть отдельным.
          </div>
        </div>

        {/* Роли получателей */}
        <div>
          <div className="text-sm font-semibold mb-2">Роли получателей</div>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map(role => {
              const active = enabledRoles.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-foreground border-border hover:border-violet-400'
                  }`}
                >
                  {role.label}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">
            Выбранным ролям будут отправляться уведомления — если у сотрудника указан User ID в MAX.
          </div>
        </div>

        {/* Когда отправлять */}
        <div>
          <div className="text-sm font-semibold mb-2">Когда отправлять</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Toggle checked={!!s.notify_max_on_lead}      onChange={v => setS({ ...s, notify_max_on_lead: v })}      label="Новая заявка" />
            <Toggle checked={!!s.notify_max_on_deal}      onChange={v => setS({ ...s, notify_max_on_deal: v })}      label="Новая сделка" />
            <Toggle checked={!!s.notify_max_on_complaint} onChange={v => setS({ ...s, notify_max_on_complaint: v })} label="Жалоба" />
          </div>
        </div>

        {/* Таблица User ID сотрудников */}
        {s.notify_max_enabled && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">MAX User ID сотрудников</div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Сотрудник пишет боту /start — получает свой ID
              </span>
            </div>
            {usersLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Icon name="Loader2" size={14} className="animate-spin" /> Загрузка...
              </div>
            ) : visibleUsers.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                Нет сотрудников с выбранными ролями. Выберите роли выше или добавьте пользователей.
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-semibold">Сотрудник</th>
                      <th className="text-left px-4 py-2.5 font-semibold">Роль</th>
                      <th className="text-left px-4 py-2.5 font-semibold">User ID в MAX</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleUsers.map(u => (
                      <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">
                            {ROLE_OPTIONS.find(r => r.id === u.role)?.label || u.role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 border rounded-lg text-sm font-mono focus:border-violet-400 outline-none"
                            placeholder="123456789"
                            value={maxUserIds[u.id] ?? ''}
                            onChange={e => setMaxUserIds(prev => ({ ...prev, [u.id]: e.target.value }))}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => saveMaxUserId(u.id)}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors whitespace-nowrap"
                          >
                            Сохранить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Дублирование на дополнительные User ID */}
            <div className="pt-2">
              <label className="text-sm font-semibold block mb-1">
                Дополнительные User ID (дублирование)
              </label>
              <input
                className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                placeholder="123456789, 987654321"
                value={s.notify_max_extra_phones || ''}
                onChange={e => setS({ ...s, notify_max_extra_phones: e.target.value })}
              />
              <div className="text-xs text-muted-foreground mt-1">
                User ID через запятую. Все уведомления будут дублироваться на эти аккаунты — удобно для директора.
              </div>
            </div>
          </div>
        )}

        {/* Тест */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={testMax}
            disabled={maxTest.loading || !s.notify_max_enabled}
            className="px-4 py-2 rounded-lg border border-violet-600 text-violet-600 text-sm font-semibold hover:bg-violet-50 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {maxTest.loading
              ? <><Icon name="Loader2" size={14} className="animate-spin" /> Отправка...</>
              : <><Icon name="Zap" size={14} /> Отправить тест в Макс</>
            }
          </button>
          {maxTest.status === 'ok' && <span className="text-emerald-600 text-sm flex items-center gap-1"><Icon name="CheckCircle2" size={14} /> {maxTest.message}</span>}
          {maxTest.status === 'err' && <span className="text-red-600 text-sm flex items-center gap-1"><Icon name="AlertCircle" size={14} /> {maxTest.message}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}