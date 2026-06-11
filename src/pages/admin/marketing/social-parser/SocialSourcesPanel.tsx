import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';

interface Source {
  id: number;
  platform: string;
  source_id: string;
  source_url: string | null;
  title: string | null;
  is_active: boolean;
  last_parsed_at: string | null;
  posts_found: number;
}

const PLATFORM_INFO: Record<string, { label: string; color: string; placeholder: string; hint: string }> = {
  vk: {
    label: 'ВКонтакте',
    color: 'text-blue-600',
    placeholder: '-123456 или public123456 или club123456',
    hint: 'ID группы (начинается с -) или slug (например: krd_commercial)',
  },
  ok: {
    label: 'Одноклассники',
    color: 'text-orange-500',
    placeholder: '123456789 или группа/slug',
    hint: 'Числовой ID группы или slug из URL (ok.ru/group/123456)',
  },
  telegram: {
    label: 'Telegram',
    color: 'text-sky-500',
    placeholder: '@channel_name или channel_name',
    hint: 'Username канала без @ (только публичные каналы)',
  },
};

export default function SocialSourcesPanel({
  token, apiUrl,
}: { token: string; apiUrl: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ platform: 'telegram', source_id: '', title: '', source_url: '' });
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
      const r = await api({ action: 'sources_list', platform: filterPlatform });
      if (!r.error) setSources(r.sources || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterPlatform]);

  const handleAdd = async () => {
    if (!form.source_id.trim()) { toast.error('Введите ID группы или канала'); return; }
    setSaving(true);
    try {
      const r = await api({ action: 'sources_add', ...form });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Источник добавлен');
      setShowForm(false);
      setForm({ platform: 'telegram', source_id: '', title: '', source_url: '' });
      load();
    } finally { setSaving(false); }
  };

  const handleDel = async (id: number) => {
    await api({ action: 'sources_del', id });
    toast.success('Источник удалён');
    load();
  };

  const fmtDate = (s: string | null) => {
    if (!s) return 'не парсили';
    const d = new Date(s);
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return 'только что';
    if (h < 24) return `${h} ч назад`;
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  };

  const plt = PLATFORM_INFO[form.platform];

  return (
    <div className="space-y-3">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Группы и каналы откуда берутся посты
        </p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-semibold"
        >
          <Icon name={showForm ? 'ChevronUp' : 'Plus'} size={13} />
          {showForm ? 'Свернуть' : 'Добавить источник'}
        </button>
      </div>

      {/* Форма добавления */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-violet-200 p-4 space-y-3">
          <h4 className="font-semibold text-sm">Новый источник</h4>

          {/* Платформа */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Платформа</label>
            <div className="flex gap-2">
              {Object.entries(PLATFORM_INFO).map(([id, info]) => (
                <button
                  key={id}
                  onClick={() => setForm(f => ({ ...f, platform: id }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    form.platform === id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* ID/slug */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              ID группы / канала
            </label>
            <input
              value={form.source_id}
              onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))}
              placeholder={plt.placeholder}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
            <p className="text-xs text-muted-foreground mt-1">{plt.hint}</p>
          </div>

          {/* Название */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Название <span className="font-normal">(для удобства в интерфейсе)</span>
            </label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Например: КНД коммерческая недвижимость"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-border rounded-xl text-sm"
            >
              Отмена
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Icon name="Loader2" size={13} className="animate-spin" />}
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* Фильтр по платформе */}
      <div className="flex gap-1">
        {[
          { id: '',         label: 'Все' },
          { id: 'vk',       label: 'VK' },
          { id: 'ok',       label: 'OK' },
          { id: 'telegram', label: 'Telegram' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setFilterPlatform(p.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              filterPlatform === p.id
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white border-border text-foreground/70'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Список источников */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Icon name="Loader2" size={18} className="animate-spin mx-auto mb-2" />Загрузка…
        </div>
      ) : sources.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <Icon name="Database" size={28} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground mb-3">Источников пока нет</p>
          <p className="text-xs text-muted-foreground">
            Добавьте группы ВКонтакте, Одноклассников или Telegram-каналы
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border">
          {sources.map(s => {
            const pInfo = PLATFORM_INFO[s.platform];
            return (
              <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${!s.is_active ? 'opacity-50' : ''}`}>
                <div className={`text-xs font-bold w-8 text-center ${pInfo?.color || 'text-slate-500'}`}>
                  {s.platform === 'vk' ? 'VK' : s.platform === 'ok' ? 'OK' : 'TG'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {s.title || s.source_id}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="truncate">{s.source_id}</span>
                    <span>·</span>
                    <span>{fmtDate(s.last_parsed_at)}</span>
                    {s.posts_found > 0 && (
                      <><span>·</span><span>{s.posts_found} постов</span></>
                    )}
                  </div>
                </div>
                {s.source_url && (
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
                  >
                    <Icon name="ExternalLink" size={13} />
                  </a>
                )}
                <button
                  onClick={() => handleDel(s.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition"
                  title="Удалить источник"
                >
                  <Icon name="Trash2" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
