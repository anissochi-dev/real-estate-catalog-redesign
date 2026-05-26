import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

interface MemoryItem {
  id: number;
  key: string;
  value: string;
  updated_at: string | null;
}

interface Usage {
  total_bytes: number;
  limit_bytes: number;
  usage_percent: number;
  items_count: number;
}

const SUGGESTED_KEYS = [
  { prefix: 'glossary_', label: 'Глоссарий' },
  { prefix: 'faq_', label: 'FAQ' },
  { prefix: 'rule_', label: 'Бизнес-правило' },
  { prefix: 'contact_', label: 'Контакты/компания' },
  { prefix: 'process_', label: 'Процесс' },
  { prefix: 'persona', label: 'Личность ВБ' },
  { prefix: 'creator_', label: 'Создатель' },
  { prefix: 'personality', label: 'Личность ВБ' },
  { prefix: 'news_', label: 'Новости рынка' },
  { prefix: 'listing_', label: 'Из объектов' },
  { prefix: 'invest_', label: 'Инвестиции' },
  { prefix: 'demand_', label: 'Спрос клиентов' },
  { prefix: 'term_', label: 'Термины' },
];

const TRAINING_SOURCES = [
  { id: 'news', label: 'Новости рынка', icon: 'Newspaper', hint: '15 последних новостей' },
  { id: 'listings', label: 'Объекты каталога', icon: 'Building2', hint: 'Описания, теги, характеристики (30 объектов)' },
  { id: 'invest', label: 'Инвест-модель', icon: 'TrendingUp', hint: 'Средние цены, окупаемость, ставки по категориям' },
  { id: 'demand', label: 'Заявки клиентов', icon: 'Inbox', hint: 'Что ищут — тренды спроса (60 заявок)' },
  { id: 'terms', label: 'Термины из описаний', icon: 'Quote', hint: 'Популярные ключевые слова и понятия' },
  { id: 'market_prices', label: 'Цены с агрегаторов', icon: 'Globe', hint: 'Парсинг Аякс, Этажи, ЦИАН — актуальные цены рынка' },
];

interface RetrainSchedule {
  enabled: boolean;
  hour: number;
  minute: number;
  sources: string[];
  last_at: string | null;
  last_status: string | null;
  last_saved: number | null;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

function categoryByKey(key: string): string {
  for (const c of SUGGESTED_KEYS) {
    if (key === c.prefix || key.startsWith(c.prefix)) return c.label;
  }
  return 'Прочее';
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('ru', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export default function VBKnowledgeAdmin() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<string>('');
  const [editing, setEditing] = useState<Partial<MemoryItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [trainingNews, setTrainingNews] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>(['news']);
  const [schedule, setSchedule] = useState<RetrainSchedule>({
    enabled: false, hour: 3, minute: 0, sources: ['news', 'listings', 'invest', 'demand', 'terms', 'market_prices'],
    last_at: null, last_status: null, last_saved: null,
  });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const trainFromNews = async () => {
    if (trainingNews) return;
    if (selectedSources.length === 0) {
      toast.error('Выберите хотя бы один источник');
      return;
    }
    const sourceNames = TRAINING_SOURCES.filter(s => selectedSources.includes(s.id)).map(s => s.label).join(', ');
    if (!confirm(`Запустить переобучение ВБ?\n\nИсточники: ${sourceNames}\n\nЭто займёт 10-60 секунд в зависимости от количества источников.`)) return;
    setTrainingNews(true);
    try {
      const r = await adminApi.trainVb(selectedSources);
      const lines = (r.per_source || []).map(s => {
        const srcName = TRAINING_SOURCES.find(t => t.id === s.source)?.label || s.source;
        if (s.error) return `${srcName}: ошибка (${s.error.slice(0, 50)})`;
        if (s.skipped) return `${srcName}: ${s.skipped}`;
        return `${srcName}: +${s.saved} фактов (из ${s.input_count || 0})`;
      });
      toast.success(`Готово! Всего добавлено: ${r.saved} фактов`, {
        description: lines.join('\n'),
        duration: 8000,
      });
      setTrainOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось переобучить');
    } finally {
      setTrainingNews(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError('');
    adminApi.listAiMemory()
      .then(d => {
        setItems(Array.isArray(d?.items) ? d.items : []);
        if (d?.usage) setUsage(d.usage as Usage);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить базу знаний');
      })
      .finally(() => setLoading(false));
  };

  const toggleSource = (id: string) => {
    setSelectedSources(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const loadSchedule = () => {
    setScheduleLoading(true);
    adminApi.getRetrainSchedule()
      .then(d => setSchedule(d))
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      await adminApi.saveRetrainSchedule({ enabled: schedule.enabled, hour: schedule.hour, minute: schedule.minute, sources: schedule.sources });
      toast.success('Расписание сохранено');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setScheduleSaving(false);
    }
  };

  useEffect(() => { load(); loadSchedule(); }, []);

  const filtered = items.filter(it => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return it.key.toLowerCase().includes(q) || it.value.toLowerCase().includes(q);
  });

  const save = async () => {
    if (!editing) return;
    const key = (editing.key || '').trim();
    const value = (editing.value || '').trim();
    if (!key || !value) {
      toast.error('Заполните ключ и значение');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await adminApi.updateAiMemory(editing.id, { key, value });
      } else {
        await adminApi.createAiMemory({ key, value });
      }
      toast.success('Сохранено');
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Удалить эту запись из базы знаний ВБ?')) return;
    try {
      await adminApi.deleteAiMemory(id);
      toast.success('Удалено');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  // Группируем по категориям
  const grouped: Record<string, MemoryItem[]> = {};
  filtered.forEach(it => {
    const cat = categoryByKey(it.key);
    (grouped[cat] = grouped[cat] || []).push(it);
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display font-800 text-lg flex items-center gap-2">
              <Icon name="Brain" size={20} className="text-brand-blue" />
              База знаний Виртуального брокера
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              ВБ использует эти факты для ответов клиентам. Глоссарий терминов, FAQ по сайту, правила подбора объектов и т.п.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setTrainOpen(true)}
              disabled={trainingNews}
              title="Переобучить ВБ из выбранных источников"
              className="px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-60 transition"
            >
              <Icon name={trainingNews ? 'Loader2' : 'Sparkles'} size={15} className={trainingNews ? 'animate-spin' : ''} />
              {trainingNews ? 'Переобучение…' : 'Переобучить ВБ'}
            </button>
            <button
              onClick={() => setEditing({ key: '', value: '' })}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              <Icon name="Plus" size={15} /> Добавить факт
            </button>
          </div>
        </div>

        {/* Индикатор использования базы знаний (лимит 500 МБ) */}
        {usage && (() => {
          const pct = usage.usage_percent;
          const isCritical = pct >= 100;
          const isWarn = pct >= 80;
          const barColor = isCritical ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500';
          const limitMb = Math.round(usage.limit_bytes / 1024 / 1024);
          return (
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-foreground">
                  Использовано: {fmtBytes(usage.total_bytes)} из {limitMb} МБ ({usage.items_count} {usage.items_count === 1 ? 'факт' : 'фактов'})
                </span>
                <span className={`font-bold ${isCritical ? 'text-red-600' : isWarn ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {pct.toFixed(2)}%
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-500`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              {isCritical && (
                <div className="mt-2 text-xs text-red-700 inline-flex items-center gap-1.5">
                  <Icon name="AlertCircle" size={13} />
                  Лимит исчерпан. Удалите старые факты или закажите расширение базы знаний.
                </div>
              )}
              {isWarn && !isCritical && (
                <div className="mt-2 text-xs text-amber-700 inline-flex items-center gap-1.5">
                  <Icon name="AlertTriangle" size={13} />
                  База знаний почти заполнена. Рекомендуем расширение на +100 МБ.
                </div>
              )}
            </div>
          );
        })()}

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Поиск по ключу или содержимому…"
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} из {items.length}
          </div>
        </div>
      </div>

      {/* Расписание автопереобучения */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Icon name="CalendarClock" size={18} className="text-brand-blue" />
            <h3 className="font-display font-700 text-base">Автопереобучение по расписанию</h3>
          </div>
          <div
            onClick={() => setSchedule(s => ({ ...s, enabled: !s.enabled }))}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${schedule.enabled ? 'bg-brand-blue' : 'bg-muted-foreground/30'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${schedule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>

        {scheduleLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Icon name="Loader2" size={14} className="animate-spin" /> Загрузка…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Время запуска (UTC / МСК)</label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={schedule.hour}
                    onChange={e => setSchedule(s => ({ ...s, hour: +e.target.value }))}
                    className="px-3 py-2 border rounded-lg text-sm w-20"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-muted-foreground font-bold">:</span>
                  <select
                    value={schedule.minute}
                    onChange={e => setSchedule(s => ({ ...s, minute: +e.target.value }))}
                    className="px-3 py-2 border rounded-lg text-sm w-20"
                  >
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-xs text-muted-foreground ml-1">
                    = {String((schedule.hour + 3) % 24).padStart(2, '0')}:{String(schedule.minute).padStart(2, '0')} МСК
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Источники</div>
                <div className="flex flex-wrap gap-2">
                  {TRAINING_SOURCES.map(src => {
                    const active = schedule.sources.includes(src.id);
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => setSchedule(s => ({
                          ...s,
                          sources: active ? s.sources.filter(x => x !== src.id) : [...s.sources, src.id],
                        }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${active ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30' : 'bg-muted/40 text-muted-foreground border-border'}`}
                        title={src.hint}
                      >
                        {src.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {schedule.last_at && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center gap-2">
                <Icon name="CheckCircle2" size={13} className="text-emerald-500 shrink-0" />
                Последний запуск: {fmtDate(schedule.last_at)}
                {schedule.last_saved != null && ` — сохранено ${schedule.last_saved} фактов`}
              </div>
            )}

            <button
              onClick={saveSchedule}
              disabled={scheduleSaving}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Icon name={scheduleSaving ? 'Loader2' : 'Save'} size={14} className={scheduleSaving ? 'animate-spin' : ''} />
              {scheduleSaving ? 'Сохранение…' : 'Сохранить расписание'}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-muted-foreground">
          <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />
          Загрузка…
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <Icon name="AlertCircle" size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-red-800 text-sm">Ошибка загрузки</div>
            <div className="text-xs text-red-700 mt-0.5">{error}</div>
            <button onClick={load} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-50 inline-flex items-center gap-1">
              <Icon name="RefreshCw" size={12} /> Повторить
            </button>
          </div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-muted-foreground">
          <Icon name="BookOpen" size={28} className="mx-auto mb-2 opacity-50" />
          {filter
            ? 'Ничего не найдено по запросу'
            : 'База знаний пуста. Добавьте первый факт, нажав «Добавить факт».'}
        </div>
      )}

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {cat} <span className="text-muted-foreground/60">({list.length})</span>
          </div>
          <div className="divide-y divide-border">
            {list.map(it => (
              <div key={it.id} className="py-3 flex items-start gap-3 group hover:bg-muted/20 -mx-2 px-2 rounded-lg transition">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-brand-blue mb-0.5">{it.key}</div>
                  <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                    {it.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">
                    Обновлено: {fmtDate(it.updated_at)}
                  </div>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(it)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue"
                    title="Редактировать"
                  >
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button
                    onClick={() => remove(it.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600"
                    title="Удалить"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Модалка выбора источников переобучения */}
      {trainOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white">
              <div className="font-display font-700 text-base flex items-center gap-2">
                <Icon name="Sparkles" size={18} className="text-amber-600" />
                Переобучить ВБ
              </div>
              <button onClick={() => setTrainOpen(false)} disabled={trainingNews} className="p-1 hover:bg-muted rounded disabled:opacity-50">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Выберите источники, из которых ИИ извлечёт факты для базы знаний ВБ:
              </p>
              <div className="space-y-2">
                {TRAINING_SOURCES.map(src => {
                  const checked = selectedSources.includes(src.id);
                  return (
                    <label
                      key={src.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        checked ? 'bg-amber-50 border-amber-300' : 'bg-white border-border hover:border-amber-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSource(src.id)}
                        disabled={trainingNews}
                        className="mt-0.5"
                      />
                      <Icon name={src.icon} size={18} className={checked ? 'text-amber-600' : 'text-muted-foreground'} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{src.label}</div>
                        <div className="text-xs text-muted-foreground">{src.hint}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Icon name="Info" size={13} className="mt-0.5 text-brand-blue" />
                  <span>
                    ИИ обработает выбранные источники и извлечёт из них 5–15 фактов на источник.
                    Каждый факт сохраняется в базе знаний с префиксом источника
                    (<code className="bg-white px-1 rounded">news_</code>, <code className="bg-white px-1 rounded">listing_</code> и т.д.).
                    Старые факты с теми же ключами будут обновлены.
                  </span>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={() => setTrainOpen(false)}
                disabled={trainingNews}
                className="px-4 py-2 rounded-xl text-sm hover:bg-muted disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={trainFromNews}
                disabled={trainingNews || selectedSources.length === 0}
                className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {trainingNews && <Icon name="Loader2" size={13} className="animate-spin" />}
                {trainingNews ? 'Идёт обучение…' : `Запустить (${selectedSources.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка редактирования */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white">
              <div className="font-display font-700 text-base">
                {editing.id ? 'Редактировать факт' : 'Новый факт'}
              </div>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Ключ (короткий идентификатор, например <code className="bg-muted px-1 rounded">glossary_gab</code> или <code className="bg-muted px-1 rounded">faq_apply</code>)
                </label>
                <input
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  placeholder="glossary_term или faq_question"
                  maxLength={100}
                  value={editing.key || ''}
                  onChange={e => setEditing({ ...editing, key: e.target.value })}
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Префиксы для группировки: <b>glossary_</b> (термины), <b>faq_</b> (FAQ), <b>rule_</b> (правила), <b>contact_</b>, <b>process_</b>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Значение (то, что ВБ будет использовать при ответе)
                </label>
                <textarea
                  rows={6}
                  className="w-full px-3 py-2 border rounded-lg text-sm leading-relaxed"
                  placeholder="Например: ГАБ (Готовый Арендный Бизнес) — объект уже сдан и приносит доход…"
                  maxLength={5000}
                  value={editing.value || ''}
                  onChange={e => setEditing({ ...editing, value: e.target.value })}
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Максимум 5000 символов. Текущая длина: {(editing.value || '').length}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl text-sm hover:bg-muted"
              >
                Отмена
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving && <Icon name="Loader2" size={13} className="animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}