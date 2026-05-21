import { useEffect, useState } from 'react';
import { NEWS_URL, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

interface NewsItem {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  is_published: boolean;
  is_auto: boolean;
  published_at?: string;
  created_at: string;
  category: string;
}

interface Schedule {
  id?: number;
  is_enabled: boolean;
  run_hour: number;
  articles_per_run: number;
  last_run_at?: string;
  last_run_count?: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00 UTC (${String((i + 3) % 24).padStart(2, '0')}:00 МСК)`,
}));

const AUTO_TOPICS = [
  'Ключевая ставка ЦБ РФ и рынок коммерческой недвижимости',
  'Аренда офисов в Краснодаре',
  'Склады и логистика Краснодарского края',
  'Торговые помещения Краснодара',
  'Готовый бизнес в Краснодаре',
  'Ипотека на коммерческую недвижимость 2025',
  'Застройщики Краснодара: новые объекты',
  'Инвестиции в ГАБ: доходность и риски',
  'Производственные помещения Кубани',
  'Рестораны и кафе: рынок аренды Краснодара',
  'Страхование коммерческой недвижимости',
  'Налоги при аренде и продаже коммерческой недвижимости',
];

function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function NewsAdmin() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token };

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'create' | 'schedule'>('list');
  const [schedule, setSchedule] = useState<Schedule>({ is_enabled: false, run_hour: 9, articles_per_run: 3 });
  const [schedSaved, setSchedSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningAuto, setRunningAuto] = useState(false);
  const [autoCount, setAutoCount] = useState(3);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');

  const [form, setForm] = useState({ title: '', summary: '', content: '', image_url: '', source_url: '', source_name: '' });
  const [saving, setSaving] = useState(false);

  const loadNews = () => {
    fetch(`${NEWS_URL}?action=admin_list`, { headers })
      .then(r => r.json())
      .then(d => setNews(d.news || []))
      .finally(() => setLoading(false));
  };

  const loadSchedule = () => {
    fetch(`${NEWS_URL}?action=schedule`, { headers })
      .then(r => r.json())
      .then(d => { if (d.schedule && d.schedule.id) setSchedule(d.schedule); });
  };

  useEffect(() => { loadNews(); loadSchedule(); }, []);

  const publish = async (id: number, state: boolean) => {
    await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'publish', id, state }) });
    setNews(n => n.map(a => a.id === id ? { ...a, is_published: state } : a));
    toast.success(state ? 'Опубликовано' : 'Снято с публикации');
  };

  const create = async () => {
    if (!form.title || !form.content) { toast.error('Заполните заголовок и текст'); return; }
    setSaving(true);
    try {
      const r = await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'create', ...form }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Статья создана');
      setForm({ title: '', summary: '', content: '', image_url: '', source_url: '', source_name: '' });
      setTab('list');
      loadNews();
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    const topic = customTopic.trim() || selectedTopic;
    setGenerating(true);
    try {
      const r = await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'generate', topic }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success(`Статья "${d.title}" создана`);
      loadNews();
      setTab('list');
    } finally {
      setGenerating(false);
    }
  };

  const runAuto = async () => {
    setRunningAuto(true);
    try {
      const r = await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'run_auto', count: autoCount }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success(`Сгенерировано статей: ${d.generated}`);
      loadNews();
    } finally {
      setRunningAuto(false);
    }
  };

  const saveSchedule = async () => {
    await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'save_schedule', ...schedule }) });
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 2000);
    toast.success('Расписание сохранено');
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-700 flex items-center gap-2">
            <Icon name="Newspaper" size={22} className="text-brand-blue" />
            Новости
          </h2>
          <p className="text-sm text-muted-foreground">Автокопирайтер анализирует рынок и публикует статьи</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('list')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'list' ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80'}`}>
            Список
          </button>
          <button onClick={() => setTab('create')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'create' ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80'}`}>
            + Создать
          </button>
          <button onClick={() => setTab('schedule')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'schedule' ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80'}`}>
            <Icon name="Clock" size={14} className="inline mr-1" />
            Расписание
          </button>
        </div>
      </div>

      {/* ── СПИСОК ── */}
      {tab === 'list' && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Icon name="Loader2" size={22} className="animate-spin mr-2" />Загрузка...
            </div>
          ) : news.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Icon name="Newspaper" size={36} className="mx-auto mb-3 opacity-30" />
              <div>Новостей нет. Создайте первую или запустите автогенерацию.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Заголовок</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-24">Тип</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-36">Дата</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground w-32">Действия</th>
                </tr>
              </thead>
              <tbody>
                {news.map(n => (
                  <tr key={n.id} className="border-t border-border hover:bg-muted/20 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium line-clamp-1">{n.title}</div>
                      {n.slug && (
                        <div className="text-xs text-muted-foreground font-mono">/news/{n.slug}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.is_auto ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {n.is_auto ? 'Авто' : 'Ручная'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(n.published_at || n.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {n.is_published ? (
                          <button onClick={() => publish(n.id, false)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600 transition font-medium">
                            Опубл.
                          </button>
                        ) : (
                          <button onClick={() => publish(n.id, true)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-muted hover:bg-emerald-100 hover:text-emerald-700 transition font-medium">
                            Опубл.
                          </button>
                        )}
                        <a href={`/news/${n.slug}`} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue transition">
                          <Icon name="ExternalLink" size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── СОЗДАТЬ / ГЕНЕРАЦИЯ ── */}
      {tab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ручная */}
          <div className="bg-white rounded-2xl border border-border p-6 space-y-4">
            <div className="font-display font-700 flex items-center gap-2">
              <Icon name="PenLine" size={18} className="text-brand-blue" />
              Написать вручную
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Заголовок *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Рынок офисов Краснодара: итоги квартала"
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Краткое описание</label>
              <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                rows={2} placeholder="2-3 предложения о чём статья"
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Текст статьи *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={8} placeholder="Полный текст статьи..."
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Ссылка на источник</label>
                <input value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Название источника</label>
                <input value={form.source_name} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))}
                  placeholder="ЦБ РФ, Авито, РБК..."
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <button onClick={create} disabled={saving || !form.title || !form.content}
              className="btn-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 w-full inline-flex items-center justify-center gap-2">
              {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
              Сохранить
            </button>
          </div>

          {/* Автогенерация */}
          <div className="bg-white rounded-2xl border border-border p-6 space-y-4">
            <div className="font-display font-700 flex items-center gap-2">
              <Icon name="Sparkles" size={18} className="text-brand-orange" />
              Автокопирайтер (YandexGPT)
            </div>
            <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-xl p-3">
              ИИ анализирует рынок коммерческой недвижимости, ключевую ставку ЦБ, данные застройщиков Краснодара и банков, и генерирует профессиональную статью.
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Выбрать тему</label>
              <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">— Случайная тема —</option>
                {AUTO_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Или своя тема</label>
              <input value={customTopic} onChange={e => setCustomTopic(e.target.value)}
                placeholder="Напишите свою тему..."
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <button onClick={generate} disabled={generating}
              className="w-full px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-orange text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {generating ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Sparkles" size={15} />}
              {generating ? 'Генерация...' : 'Сгенерировать статью'}
            </button>

            <div className="border-t border-border pt-4">
              <div className="text-sm font-semibold mb-3">Пакетная генерация</div>
              <div className="flex items-center gap-3 mb-3">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Статей за раз:</label>
                <input type="number" min={1} max={10} value={autoCount} onChange={e => setAutoCount(+e.target.value)}
                  className="w-20 px-2 py-1.5 border rounded-lg text-sm text-center" />
              </div>
              <button onClick={runAuto} disabled={runningAuto}
                className="w-full px-4 py-2 rounded-xl text-sm font-medium bg-purple-600 text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {runningAuto ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Zap" size={15} />}
                {runningAuto ? 'Генерация...' : `Сгенерировать ${autoCount} статей`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── РАСПИСАНИЕ ── */}
      {tab === 'schedule' && (
        <div className="bg-white rounded-2xl border border-border p-6 max-w-lg space-y-5">
          <div className="font-display font-700 flex items-center gap-2">
            <Icon name="Clock" size={18} className="text-brand-blue" />
            Расписание автогенерации
          </div>
          <div className="text-sm text-muted-foreground">
            Копирайтер будет автоматически генерировать и сохранять статьи по расписанию. Новые статьи создаются в статусе «Черновик» — публикуйте вручную.
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={schedule.is_enabled}
              onChange={e => setSchedule(s => ({ ...s, is_enabled: e.target.checked }))}
              className="w-4 h-4 accent-brand-blue" />
            <span className="font-medium">Включить автозапуск</span>
          </label>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Время запуска</label>
            <select value={schedule.run_hour} onChange={e => setSchedule(s => ({ ...s, run_hour: +e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Статей за один запуск</label>
            <input type="number" min={1} max={10} value={schedule.articles_per_run}
              onChange={e => setSchedule(s => ({ ...s, articles_per_run: +e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          {schedule.last_run_at && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
              Последний запуск: {fmtDate(schedule.last_run_at)} · Создано статей: {schedule.last_run_count ?? 0}
            </div>
          )}

          <button onClick={saveSchedule}
            className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold w-full">
            {schedSaved ? 'Сохранено!' : 'Сохранить расписание'}
          </button>
        </div>
      )}
    </div>
  );
}
