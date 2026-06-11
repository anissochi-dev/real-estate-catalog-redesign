import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';

interface Session {
  id: number;
  platform: string;
  label: string;
  is_active: boolean;
  is_blocked: boolean;
  blocked_until: string | null;
  requests_today: number;
  requests_hour: number;
  last_request_at: string | null;
  updated_at: string;
}

const LIMITS: Record<string, { day: number; hour: number }> = {
  vk:       { day: 1000, hour: 200 },
  ok:       { day: 800,  hour: 150 },
  telegram: { day: 3000, hour: 500 },
};

const INSTRUCTIONS: Record<string, { title: string; steps: string[]; cookieKeys: string[] }> = {
  vk: {
    title: 'Как получить куки ВКонтакте',
    steps: [
      'Откройте vk.com и войдите в технический аккаунт',
      'Нажмите F12 → вкладка Application (Chrome) или Storage (Firefox)',
      'Выберите Cookies → https://vk.com',
      'Скопируйте значения: remixsid, remixlang, remixstid, remixdt',
      'Вставьте в поле ниже в формате JSON',
    ],
    cookieKeys: ['remixsid', 'remixlang', 'remixstid', 'remixdt'],
  },
  ok: {
    title: 'Как получить куки Одноклассников',
    steps: [
      'Откройте ok.ru и войдите в технический аккаунт',
      'Нажмите F12 → Application → Cookies → https://ok.ru',
      'Скопируйте значения: AUTHECODE, KANUN, st.cmd',
      'Вставьте в поле ниже в формате JSON',
    ],
    cookieKeys: ['AUTHECODE', 'KANUN', 'st.cmd'],
  },
  telegram: {
    title: 'Telegram не требует куки',
    steps: [
      'Публичные каналы Telegram парсятся без авторизации',
      'Сессия не нужна — добавьте каналы в раздел «Источники»',
    ],
    cookieKeys: [],
  },
};

const COOKIE_WARN_DAYS = 14;

function cookieAgeDays(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
}

export default function SocialSessionsPanel({
  token, apiUrl, onCookieWarning,
}: { token: string; apiUrl: string; onCookieWarning?: (count: number) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState('vk');
  const [label, setLabel] = useState('default');
  const [cookiesText, setCookiesText] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [saving, setSaving] = useState(false);

  const api = async (body: object) => {
    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(body),
    }).then(r => r.json());
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await api({ action: 'sessions_list' });
      if (!r.error) {
        const list: Session[] = r.sessions || [];
        setSessions(list);
        const warnCount = list.filter(
          s => s.platform !== 'telegram' && s.is_active && cookieAgeDays(s.updated_at) >= COOKIE_WARN_DAYS
        ).length;
        onCookieWarning?.(warnCount);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (platform !== 'telegram' && !cookiesText.trim()) {
      toast.error('Введите куки в формате JSON');
      return;
    }
    let cookies: object | string | null = null;
    if (cookiesText.trim()) {
      try {
        cookies = JSON.parse(cookiesText);
      } catch {
        toast.error('Неверный формат JSON. Проверьте куки.');
        return;
      }
    }
    setSaving(true);
    try {
      const r = await api({ action: 'sessions_add', platform, label, cookies });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Сессия сохранена');
      setShowForm(false);
      setCookiesText('');
      setLabel('default');
      load();
    } finally { setSaving(false); }
  };

  const handleDel = async (id: number) => {
    await api({ action: 'sessions_del', id });
    toast.success('Сессия удалена');
    load();
  };

  const fmtDate = (s: string | null) => {
    if (!s) return 'никогда';
    const d = new Date(s);
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return 'только что';
    if (h < 24) return `${h} ч назад`;
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  };

  const fmtBlocked = (s: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    if (d < new Date()) return '';
    const min = Math.ceil((d.getTime() - Date.now()) / 60_000);
    return `ещё ${min} мин`;
  };

  const ins = INSTRUCTIONS[platform];
  const lim = LIMITS[platform] || { day: 1000, hour: 200 };

  return (
    <div className="space-y-3">
      {/* Инфо-блок */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <div className="flex items-start gap-2">
          <Icon name="Info" size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Куки нужны только для VK и Одноклассников</p>
            <p>Telegram-каналы парсятся без авторизации — публичные каналы не требуют сессии.</p>
            <p>Куки принадлежат техническому аккаунту, который вступил в нужные группы. Обновлять куки нужно примерно раз в 2-4 недели.</p>
          </div>
        </div>
      </div>

      {/* Шапка */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Сессии авторизации для парсинга</p>
        <button
          onClick={() => { setShowForm(v => !v); setShowInstruction(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-semibold"
        >
          <Icon name={showForm ? 'ChevronUp' : 'Plus'} size={13} />
          {showForm ? 'Свернуть' : 'Добавить сессию'}
        </button>
      </div>

      {/* Форма */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-violet-200 p-4 space-y-4">
          <h4 className="font-semibold text-sm">Новая сессия</h4>

          {/* Платформа */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Платформа</label>
            <div className="flex gap-2">
              {[
                { id: 'vk',       label: 'ВКонтакте',    color: 'text-blue-600' },
                { id: 'ok',       label: 'Одноклассники', color: 'text-orange-500' },
                { id: 'telegram', label: 'Telegram',      color: 'text-sky-500' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPlatform(p.id); setShowInstruction(false); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    platform === p.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {platform === 'telegram' ? (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-800">
              <p className="font-semibold mb-1">Telegram не требует сессии</p>
              <p className="text-xs">Добавьте каналы в раздел «Источники» — они будут парситься без авторизации.</p>
            </div>
          ) : (
            <>
              {/* Название */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название сессии</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="default"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              {/* Инструкция */}
              <button
                onClick={() => setShowInstruction(v => !v)}
                className="flex items-center gap-1.5 text-xs text-violet-600 font-medium"
              >
                <Icon name={showInstruction ? 'ChevronUp' : 'HelpCircle'} size={13} />
                {showInstruction ? 'Скрыть инструкцию' : 'Как получить куки?'}
              </button>

              {showInstruction && (
                <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold">{ins.title}</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    {ins.steps.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                  {ins.cookieKeys.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium mb-1">Пример JSON:</p>
                      <pre className="text-[10px] bg-white border border-border rounded-lg p-2 overflow-x-auto">
                        {JSON.stringify(Object.fromEntries(ins.cookieKeys.map(k => [k, '...'])), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Куки */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Куки (JSON формат)
                </label>
                <textarea
                  value={cookiesText}
                  onChange={e => setCookiesText(e.target.value)}
                  placeholder={'{\n  "remixsid": "...",\n  "remixlang": "0"\n}'}
                  rows={5}
                  className="w-full border border-border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                <Icon name="Shield" size={13} />
                Лимиты: {lim.day} запросов/день, {lim.hour} запросов/час. При превышении сессия автоматически блокируется на паузу.
              </div>
            </>
          )}

          {platform !== 'telegram' && (
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-xl text-sm">
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Icon name="Loader2" size={13} className="animate-spin" />}
                Сохранить
              </button>
            </div>
          )}
        </div>
      )}

      {/* Список сессий */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Icon name="Loader2" size={18} className="animate-spin mx-auto mb-2" />Загрузка…
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <Icon name="KeyRound" size={28} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground mb-1">Сессий пока нет</p>
          <p className="text-xs text-muted-foreground">Добавьте куки для парсинга VK и Одноклассников</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border">
          {sessions.map(s => {
            const lmt = LIMITS[s.platform] || { day: 1000, hour: 200 };
            const dayPct = Math.min(100, Math.round((s.requests_today / lmt.day) * 100));
            const blocked = s.is_blocked && s.blocked_until && new Date(s.blocked_until) > new Date();
            const pColors: Record<string, string> = { vk: 'text-blue-600', ok: 'text-orange-500', telegram: 'text-sky-500' };
            const ageDays = cookieAgeDays(s.updated_at);
            const cookieStale = s.platform !== 'telegram' && ageDays >= COOKIE_WARN_DAYS;
            return (
              <div key={s.id} className="p-4">
                {cookieStale && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700">
                    <Icon name="AlertTriangle" size={13} className="flex-shrink-0" />
                    <span>Куки обновлялись <strong>{ageDays} дн. назад</strong> — пора заменить (рекомендуется каждые 2 недели)</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold ${pColors[s.platform] || 'text-slate-500'}`}>
                        {s.platform.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium">{s.label}</span>
                      {blocked ? (
                        <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[10px] font-semibold">
                          ❌ Заблокирована {fmtBlocked(s.blocked_until)}
                        </span>
                      ) : s.is_active ? (
                        <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-[10px] font-semibold">
                          ✅ Активна
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full text-[10px] font-semibold">
                          Отключена
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Запросов сегодня: {s.requests_today} / {lmt.day}</span>
                        <span>{dayPct}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            dayPct > 80 ? 'bg-red-500' : dayPct > 50 ? 'bg-amber-400' : 'bg-green-500'
                          }`}
                          style={{ width: `${dayPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Последний запрос: {fmtDate(s.last_request_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDel(s.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition flex-shrink-0"
                    title="Удалить сессию"
                  >
                    <Icon name="Trash2" size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}