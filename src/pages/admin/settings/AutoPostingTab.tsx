import { useEffect, useState } from 'react';
import { SOCIAL_POST_URL, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

interface PlatformSetting {
  id: number;
  platform: string;
  is_enabled: boolean;
  has_token: boolean;
  access_token_masked?: string;
  token_extra?: string;
  auto_on_listing: boolean;
  auto_on_lead: boolean;
  post_template: string;
}

const PLATFORM_META: Record<string, { label: string; icon: string; color: string; has_api: boolean; hint_token: string; hint_extra: string }> = {
  vk:         { label: 'ВКонтакте',     icon: 'MessageSquare', color: 'text-blue-600',   has_api: true,  hint_token: 'Токен доступа группы (access_token из настроек группы → API)',  hint_extra: 'ID группы со знаком минус (например -123456789)' },
  telegram:   { label: 'Telegram',      icon: 'Send',          color: 'text-sky-500',    has_api: true,  hint_token: 'Токен бота (получить у @BotFather)',                            hint_extra: 'ID канала (например -1001234567890 или @username)' },
  pinterest:  { label: 'Pinterest',     icon: 'Image',         color: 'text-red-500',    has_api: false, hint_token: '',                                                             hint_extra: '' },
  linkedin:   { label: 'LinkedIn',      icon: 'Linkedin',      color: 'text-blue-700',   has_api: false, hint_token: '',                                                             hint_extra: '' },
  yandex_zen: { label: 'Яндекс Дзен',  icon: 'BookOpen',      color: 'text-yellow-600', has_api: false, hint_token: '',                                                             hint_extra: '' },
  tenchat:    { label: 'TenChat',       icon: 'Users',         color: 'text-emerald-600',has_api: false, hint_token: '',                                                             hint_extra: '' },
  max:        { label: 'Макс',          icon: 'MessageCircle', color: 'text-violet-600', has_api: false, hint_token: '',                                                             hint_extra: '' },
  dvizhenie:  { label: 'dvizhenie.ru',  icon: 'TrendingUp',    color: 'text-orange-600', has_api: false, hint_token: '',                                                             hint_extra: '' },
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  vk:         '🏢 {title}\n💰 {price} · 📐 {area}\n📍 {address}\n\n{description}\n\n🔗 {url}',
  telegram:   '*{title}*\n💰 {price} · 📐 {area}\n📍 {address}\n\n{description}\n\n🔗 {url}',
  pinterest:  '{title} | {price} | {address}',
  linkedin:   '{title}\n\n{price} · {area}\n📍 {address}\n\n{description}\n\n{url}',
  yandex_zen: '{title}\n\n{description}\n\nСсылка: {url}',
  tenchat:    '🏢 {title}\n💰 {price} · {area}\n📍 {address}\n\n{description}\n\n{url}',
  max:        '🏢 {title}\n💰 {price} · 📐 {area}\n📍 {address}\n\n{description}\n\n🔗 {url}',
  dvizhenie:  '{title}\n{price} · {area} · {address}\n\n{url}',
};

export default function AutoPostingTab() {
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() };
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { token: string; extra: string; template: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const load = () => {
    setLoading(true);
    fetch(`${SOCIAL_POST_URL}?action=settings`, { headers })
      .then(r => r.json())
      .then(d => setSettings(d.settings || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (platform: string, field: 'is_enabled' | 'auto_on_listing' | 'auto_on_lead', value: boolean) => {
    await fetch(SOCIAL_POST_URL, {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'save_settings', platform, [field]: value }),
    });
    setSettings(s => s.map(p => p.platform === platform ? { ...p, [field]: value } : p));
  };

  const save = async (platform: string) => {
    const e = editing[platform];
    if (!e) return;
    setSaving(platform);
    try {
      const body: Record<string, unknown> = { action: 'save_settings', platform, post_template: e.template };
      if (e.token) body.access_token = e.token;
      if (e.extra !== undefined) body.token_extra = e.extra;
      const r = await fetch(SOCIAL_POST_URL, { method: 'POST', headers, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Настройки сохранены');
      setEditing(prev => { const n = { ...prev }; delete n[platform]; return n; });
      load();
    } finally {
      setSaving(null);
    }
  };

  const test = async (platform: string) => {
    setTesting(platform);
    try {
      const r = await fetch(SOCIAL_POST_URL, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'test', platform }),
      });
      const d = await r.json();
      setTestResults(prev => ({ ...prev, [platform]: { ok: !d.error, message: d.message || d.error || 'Ошибка' } }));
    } finally {
      setTesting(null);
    }
  };

  const startEdit = (ps: PlatformSetting) => {
    setEditing(prev => ({
      ...prev,
      [ps.platform]: {
        token: '',
        extra: ps.token_extra || '',
        template: ps.post_template || DEFAULT_TEMPLATES[ps.platform] || '',
      },
    }));
    setExpanded(ps.platform);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Icon name="Loader2" size={22} className="animate-spin text-brand-blue mr-2" />
      Загрузка...
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-900 space-y-1.5">
        <div className="font-semibold flex items-center gap-2">
          <Icon name="Info" size={15} />
          Как работает автопостинг
        </div>
        <div>Объявления и заявки автоматически публикуются в выбранные соцсети при добавлении на сайте.</div>
        <div><b>С прямым API</b> (публикуется автоматически): ВКонтакте, Telegram.</div>
        <div><b>Подготовка текста</b> (копируете и публикуете вручную): Pinterest, LinkedIn, Яндекс Дзен, TenChat, МАК, dvizhenie.ru.</div>
        <div className="text-xs font-mono bg-amber-100 rounded px-3 py-1.5 mt-2">
          Переменные шаблона: {'{title}'} {'{price}'} {'{area}'} {'{address}'} {'{description}'} {'{url}'} {'{city}'}
        </div>
      </div>

      {settings.map(ps => {
        const meta = PLATFORM_META[ps.platform] || { label: ps.platform, icon: 'Globe', color: 'text-muted-foreground', has_api: false, hint_token: '', hint_extra: '' };
        const isExpanded = expanded === ps.platform;
        const ed = editing[ps.platform];
        const tr = testResults[ps.platform];

        return (
          <div key={ps.platform} className="bg-white rounded-2xl border border-border overflow-hidden">
            {/* Заголовок платформы */}
            <div className="flex items-center gap-3 px-5 py-4">
              <div className={`w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center ${meta.color}`}>
                <Icon name={meta.icon} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-sm">{meta.label}</div>
                  {tr ? (
                    tr.ok ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                        <Icon name="CheckCircle2" size={10} /> Работает
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                        <Icon name="XCircle" size={10} /> Ошибка
                      </span>
                    )
                  ) : ps.is_enabled && ps.has_token ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      <Icon name="Clock" size={10} /> Не проверено
                    </span>
                  ) : ps.has_token ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full">
                      <Icon name="PauseCircle" size={10} /> Выключено
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full">
                      <Icon name="Circle" size={10} /> Не настроено
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {meta.has_api ? 'Прямой API' : 'Подготовка текста'}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Авто при объекте */}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Авто при новом объекте">
                  <input type="checkbox" checked={ps.auto_on_listing}
                    onChange={e => toggle(ps.platform, 'auto_on_listing', e.target.checked)}
                    className="accent-brand-blue w-3.5 h-3.5" />
                  <span className="text-muted-foreground">Объект</span>
                </label>
                {/* Авто при заявке */}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Авто при новой заявке">
                  <input type="checkbox" checked={ps.auto_on_lead}
                    onChange={e => toggle(ps.platform, 'auto_on_lead', e.target.checked)}
                    className="accent-brand-blue w-3.5 h-3.5" />
                  <span className="text-muted-foreground">Заявка</span>
                </label>

                {/* Включить/выключить */}
                <button
                  onClick={() => toggle(ps.platform, 'is_enabled', !ps.is_enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ps.is_enabled ? 'bg-brand-blue' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${ps.is_enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>

                {/* Настройки */}
                <button onClick={() => { setExpanded(isExpanded ? null : ps.platform); if (!isExpanded) startEdit(ps); }}
                  className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground">
                  <Icon name={isExpanded ? 'ChevronUp' : 'Settings'} size={16} />
                </button>
              </div>
            </div>

            {/* Детали результата теста */}
            {tr && (
              <div className={`mx-5 mb-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${tr.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                <Icon name={tr.ok ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
                <span>{tr.message}</span>
              </div>
            )}

            {/* Форма настройки */}
            {isExpanded && ed && (
              <div className="border-t border-border px-5 py-4 space-y-3 bg-muted/20">
                {meta.has_api && (
                  <>
                    <div>
                      <label className="text-xs font-semibold block mb-1">
                        {meta.hint_token || 'Токен доступа'}
                        {ps.has_token && <span className="ml-2 text-muted-foreground font-normal">(сохранён: {ps.access_token_masked})</span>}
                      </label>
                      <input
                        type="password"
                        value={ed.token}
                        onChange={e => setEditing(prev => ({ ...prev, [ps.platform]: { ...prev[ps.platform], token: e.target.value } }))}
                        placeholder={ps.has_token ? 'Оставьте пустым чтобы не менять' : 'Вставьте токен...'}
                        className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                      />
                    </div>
                    {meta.hint_extra && (
                      <div>
                        <label className="text-xs font-semibold block mb-1">{meta.hint_extra}</label>
                        <input
                          value={ed.extra}
                          onChange={e => setEditing(prev => ({ ...prev, [ps.platform]: { ...prev[ps.platform], extra: e.target.value } }))}
                          placeholder="Например: -123456789"
                          className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold block mb-1">Шаблон поста</label>
                  <textarea
                    value={ed.template}
                    onChange={e => setEditing(prev => ({ ...prev, [ps.platform]: { ...prev[ps.platform], template: e.target.value } }))}
                    rows={4}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button onClick={() => save(ps.platform)} disabled={saving === ps.platform}
                    className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
                    {saving === ps.platform ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
                    Сохранить
                  </button>
                  {meta.has_api && (
                    <button onClick={() => test(ps.platform)} disabled={testing === ps.platform}
                      className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2">
                      {testing === ps.platform ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Zap" size={14} />}
                      Проверить подключение
                    </button>
                  )}
                  {!meta.has_api && (
                    <a href={ps.platform === 'yandex_zen' ? 'https://dzen.ru/' :
                            ps.platform === 'linkedin' ? 'https://www.linkedin.com/feed/' :
                            ps.platform === 'pinterest' ? 'https://www.pinterest.ru/' :
                            ps.platform === 'tenchat' ? 'https://tenchat.ru/' : '#'}
                      target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted inline-flex items-center gap-2">
                      <Icon name="ExternalLink" size={14} />
                      Открыть {meta.label}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}