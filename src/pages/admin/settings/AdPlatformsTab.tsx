import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface PlatformKey {
  id: number;
  platform: string;
  api_key: string | null;
  api_secret: string | null;
  extra: Record<string, string> | null;
  is_active: boolean;
  updated_at: string | null;
}

const PLATFORM_META: Record<string, { label: string; icon: string; color: string; fields: { key: string; label: string; secret?: boolean; hint?: string }[] }> = {
  avito: {
    label: 'Авито',
    icon: 'ShoppingBag',
    color: 'text-green-600 bg-green-50 border-green-200',
    fields: [
      { key: 'api_key', label: 'Client ID', hint: 'Получите в кабинете Авито → API' },
      { key: 'api_secret', label: 'Client Secret', secret: true },
    ],
  },
  cian: {
    label: 'ЦИАН',
    icon: 'Building2',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    fields: [
      { key: 'api_key', label: 'API Token', hint: 'Настройки → Интеграции → API в кабинете ЦИАН', secret: true },
    ],
  },
  yandex_realty: {
    label: 'Яндекс.Недвижимость',
    icon: 'Home',
    color: 'text-red-600 bg-red-50 border-red-200',
    fields: [
      { key: 'api_key', label: 'OAuth Token', hint: 'oauth.yandex.ru → авторизуйтесь под логином партнёрского кабинета', secret: true },
      { key: 'extra.client_id', label: 'Client ID', hint: 'ID клиента в Балансе Яндекса (Партнёрский кабинет → Реквизиты)' },
      { key: 'extra.agency_id', label: 'Agency ID', hint: 'ID агентства в Балансе Яндекса (необязательно)' },
    ],
  },
  domclick: {
    label: 'Домклик',
    icon: 'MousePointer',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    fields: [
      { key: 'api_key', label: 'API Key', hint: 'Ключ из личного кабинета Домклик' },
    ],
  },
  youla: {
    label: 'Юла',
    icon: 'Circle',
    color: 'text-violet-600 bg-violet-50 border-violet-200',
    fields: [
      { key: 'api_key', label: 'Client ID' },
      { key: 'api_secret', label: 'Client Secret', secret: true },
    ],
  },
};

function getFieldValue(p: PlatformKey, fieldKey: string): string {
  if (fieldKey.startsWith('extra.')) {
    const k = fieldKey.replace('extra.', '');
    return (p.extra?.[k] as string) || '';
  }
  if (fieldKey === 'api_key') return p.api_key || '';
  if (fieldKey === 'api_secret') return p.api_secret || '';
  return '';
}

export default function AdPlatformsTab() {
  const [platforms, setPlatforms] = useState<PlatformKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<number, Record<string, string>>>({});
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  const load = () => {
    adminApi.getAdPlatformKeys().then(r => {
      setPlatforms(r.platforms || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const edit = (id: number, key: string, val: string) => {
    setLocalEdits(e => ({ ...e, [id]: { ...(e[id] || {}), [key]: val } }));
  };

  const save = async (p: PlatformKey) => {
    const edits = localEdits[p.id] || {};
    const body: Record<string, unknown> = { is_active: p.is_active };
    if ('api_key' in edits) body.api_key = edits.api_key;
    if ('api_secret' in edits) body.api_secret = edits.api_secret;
    const extraEdits = Object.entries(edits).filter(([k]) => k.startsWith('extra.'));
    if (extraEdits.length) {
      const extra = { ...(p.extra || {}) };
      extraEdits.forEach(([k, v]) => { extra[k.replace('extra.', '')] = v; });
      body.extra = extra;
    }
    setSaving(p.id);
    try {
      await adminApi.updateAdPlatformKey(p.id, body);
      setSaved(s => ({ ...s, [p.id]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [p.id]: false })), 2000);
      load();
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (p: PlatformKey) => {
    await adminApi.updateAdPlatformKey(p.id, { is_active: !p.is_active });
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon name="Loader2" size={24} className="animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <Icon name="Info" size={16} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold mb-0.5">Универсальный шлюз досок объявлений</div>
          Здесь хранятся API-ключи для публикации объектов на внешних площадках. Ключи используются при выгрузке через XML или прямой API. Никогда не передавайте ключи третьим лицам.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {platforms.map(p => {
          const meta = PLATFORM_META[p.platform];
          if (!meta) return null;
          const edits = localEdits[p.id] || {};
          return (
            <div key={p.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${p.is_active ? 'border-border' : 'border-border opacity-70'}`}>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${meta.color}`}>
                  <Icon name={meta.icon} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-sm">{meta.label}</div>
                    {p.is_active && p.api_key ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                        <Icon name="CheckCircle2" size={10} /> Подключено
                      </span>
                    ) : p.api_key ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        <Icon name="PauseCircle" size={10} /> Ключ есть, выключено
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full">
                        <Icon name="Circle" size={10} /> Не настроено
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.updated_at ? `Обновлено ${new Date(p.updated_at).toLocaleDateString('ru')}` : 'Ключи не заданы'}
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(p)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${p.is_active ? 'bg-brand-blue' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${p.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                {meta.fields.map(f => {
                  const val = f.key in edits ? edits[f.key] : getFieldValue(p, f.key);
                  const isSecret = f.secret;
                  const showSec = showSecrets[p.id];
                  return (
                    <div key={f.key}>
                      <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
                      <div className="relative">
                        <input
                          type={isSecret && !showSec ? 'password' : 'text'}
                          value={val}
                          onChange={e => edit(p.id, f.key, e.target.value)}
                          placeholder={`Введите ${f.label}...`}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm pr-10 outline-none focus:border-brand-blue font-mono"
                        />
                        {isSecret && (
                          <button type="button"
                            onClick={() => setShowSecrets(s => ({ ...s, [p.id]: !s[p.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <Icon name={showSec ? 'EyeOff' : 'Eye'} size={14} />
                          </button>
                        )}
                      </div>
                      {f.hint && <div className="text-xs text-muted-foreground mt-0.5">{f.hint}</div>}
                    </div>
                  );
                })}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => save(p)}
                    disabled={saving === p.id}
                    className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {saving === p.id
                      ? <><Icon name="Loader2" size={14} className="animate-spin" /> Сохранение...</>
                      : saved[p.id]
                        ? <><Icon name="Check" size={14} /> Сохранено</>
                        : <><Icon name="Save" size={14} /> Сохранить</>
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-muted/40 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-sm text-foreground mb-1">Как это работает</div>
        <div>1. Получите API-ключи в личных кабинетах площадок</div>
        <div>2. Введите ключи и активируйте площадку</div>
        <div>3. При выгрузке объектов через XML или прямой API — ключи используются автоматически</div>
        <div>4. Заявки с площадок поступают в раздел «Заявки» админ-панели</div>
      </div>
    </div>
  );
}