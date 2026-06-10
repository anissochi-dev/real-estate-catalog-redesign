import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { MemoryItem, Usage, RetrainSchedule, TRAINING_SOURCES, categoryByKey } from './vb-knowledge/types';
import VBKnowledgeHeader from './vb-knowledge/VBKnowledgeHeader';
import VBRetrainSchedule from './vb-knowledge/VBRetrainSchedule';
import VBMemoryList from './vb-knowledge/VBMemoryList';

interface StopWord { id: number; word: string; created_at: string }
interface LearnSource { id: number; title: string; url: string; is_active: boolean; last_fetched_at: string | null }

export default function VBKnowledgeAdmin() {
  const [tab, setTab] = useState<'knowledge' | 'stopwords' | 'sources'>('knowledge');

  // База знаний
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<string>('');
  const [editing, setEditing] = useState<Partial<MemoryItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [trainingNews, setTrainingNews] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  const ALL_SOURCE_IDS = TRAINING_SOURCES.map(s => s.id);
  const [selectedSources, setSelectedSources] = useState<string[]>(ALL_SOURCE_IDS);
  const [schedule, setSchedule] = useState<RetrainSchedule>({
    enabled: false, hour: 3, minute: 0, sources: ALL_SOURCE_IDS,
    last_at: null, last_status: null, last_saved: null,
  });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // Стоп-слова
  const [stopWords, setStopWords] = useState<StopWord[]>([]);
  const [stopWordsLoading, setStopWordsLoading] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [addingWord, setAddingWord] = useState(false);

  // Источники обучения
  const [learnSources, setLearnSources] = useState<LearnSource[]>([]);
  const [learnSourcesLoading, setLearnSourcesLoading] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [addingSource, setAddingSource] = useState(false);

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
      .then(d => {
        // Мержим с полным списком: новые источники всегда включены по умолчанию
        const savedSources: string[] = Array.isArray(d.sources) ? d.sources : [];
        const finalSources = savedSources.length
          ? [...new Set([...savedSources, ...ALL_SOURCE_IDS.filter(id => !savedSources.includes(id))])]
          : ALL_SOURCE_IDS;
        setSchedule({ ...d, hour: (d.hour + 3) % 24, sources: finalSources });
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  };

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const hourUtc = (schedule.hour + 21) % 24; // МСК → UTC для сохранения
      await adminApi.saveRetrainSchedule({ enabled: schedule.enabled, hour: hourUtc, minute: schedule.minute, sources: schedule.sources });
      toast.success('Расписание сохранено');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setScheduleSaving(false);
    }
  };

  const loadStopWords = () => {
    setStopWordsLoading(true);
    adminApi.listVbStopWords()
      .then(d => setStopWords(d.items || []))
      .catch(() => {})
      .finally(() => setStopWordsLoading(false));
  };

  const addStopWord = async () => {
    const w = newWord.trim();
    if (!w) return;
    setAddingWord(true);
    try {
      await adminApi.createVbStopWord({ word: w });
      setNewWord('');
      toast.success('Стоп-слово добавлено');
      loadStopWords();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAddingWord(false);
    }
  };

  const removeStopWord = async (id: number) => {
    await adminApi.deleteVbStopWord(id);
    setStopWords(sw => sw.filter(w => w.id !== id));
    toast.success('Удалено');
  };

  const loadLearnSources = () => {
    setLearnSourcesLoading(true);
    adminApi.listVbLearnSources()
      .then(d => setLearnSources(d.items || []))
      .catch(() => {})
      .finally(() => setLearnSourcesLoading(false));
  };

  const addLearnSource = async () => {
    const title = newSourceTitle.trim();
    const url = newSourceUrl.trim();
    if (!title || !url) { toast.error('Заполните название и URL'); return; }
    setAddingSource(true);
    try {
      await adminApi.createVbLearnSource({ title, url });
      setNewSourceTitle('');
      setNewSourceUrl('');
      toast.success('Источник добавлен');
      loadLearnSources();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAddingSource(false);
    }
  };

  const toggleLearnSource = async (src: LearnSource) => {
    await adminApi.updateVbLearnSource(src.id, { is_active: !src.is_active });
    setLearnSources(ls => ls.map(s => s.id === src.id ? { ...s, is_active: !s.is_active } : s));
  };

  const removeLearnSource = async (id: number) => {
    await adminApi.deleteVbLearnSource(id);
    setLearnSources(ls => ls.filter(s => s.id !== id));
    toast.success('Удалено');
  };

  useEffect(() => { load(); loadSchedule(); loadStopWords(); loadLearnSources(); }, []);

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

  const grouped: Record<string, MemoryItem[]> = {};
  filtered.forEach(it => {
    const cat = categoryByKey(it.key);
    (grouped[cat] = grouped[cat] || []).push(it);
  });

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Вкладки */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-border w-fit">
        {([
          { id: 'knowledge', label: 'База знаний', icon: 'Brain' },
          { id: 'stopwords', label: 'Стоп-слова', icon: 'Ban' },
          { id: 'sources', label: 'Источники обучения', icon: 'Link' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition ${tab === t.id ? 'bg-brand-blue text-white' : 'text-foreground/70 hover:bg-muted'}`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Стоп-слова ── */}
      {tab === 'stopwords' && (
        <div className="bg-white rounded-2xl border border-border p-6 space-y-5">
          <div>
            <h3 className="font-display font-700 text-base flex items-center gap-2">
              <Icon name="Ban" size={18} className="text-red-500" />
              Стоп-слова
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Слова и фразы, которые ВБ никогда не будет использовать в ответах и текстах.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              value={newWord}
              onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStopWord()}
              placeholder="Введите слово или фразу..."
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
            />
            <button
              onClick={addStopWord}
              disabled={addingWord || !newWord.trim()}
              className="px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              <Icon name={addingWord ? 'Loader2' : 'Plus'} size={14} className={addingWord ? 'animate-spin' : ''} />
              Добавить
            </button>
          </div>

          {stopWordsLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Icon name="Loader2" size={16} className="animate-spin mx-auto mb-2" />Загрузка…
            </div>
          ) : stopWords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Icon name="Ban" size={32} className="mx-auto mb-2 opacity-20" />
              Стоп-слова не добавлены
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stopWords.map(sw => (
                <span key={sw.id} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-sm font-medium">
                  {sw.word}
                  <button onClick={() => removeStopWord(sw.id)} className="hover:text-red-900 transition ml-0.5">
                    <Icon name="X" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Источники обучения ── */}
      {tab === 'sources' && (
        <div className="bg-white rounded-2xl border border-border p-6 space-y-5">
          <div>
            <h3 className="font-display font-700 text-base flex items-center gap-2">
              <Icon name="Link" size={18} className="text-brand-blue" />
              Источники для самообучения
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              ВБ будет автоматически читать эти сайты и запоминать полезные факты. Включите источник «Мои ссылки» при переобучении.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={newSourceTitle}
                onChange={e => setNewSourceTitle(e.target.value)}
                placeholder="Название сайта"
                className="w-40 px-3 py-2 border rounded-lg text-sm"
              />
              <input
                value={newSourceUrl}
                onChange={e => setNewSourceUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLearnSource()}
                placeholder="https://example.com/page"
                className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono text-xs"
              />
              <button
                onClick={addLearnSource}
                disabled={addingSource || !newSourceTitle.trim() || !newSourceUrl.trim()}
                className="px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
              >
                <Icon name={addingSource ? 'Loader2' : 'Plus'} size={14} className={addingSource ? 'animate-spin' : ''} />
                Добавить
              </button>
            </div>
          </div>

          {learnSourcesLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Icon name="Loader2" size={16} className="animate-spin mx-auto mb-2" />Загрузка…
            </div>
          ) : learnSources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Icon name="Link" size={32} className="mx-auto mb-2 opacity-20" />
              Источники не добавлены
            </div>
          ) : (
            <div className="space-y-2">
              {learnSources.map(src => (
                <div key={src.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                  <button
                    onClick={() => toggleLearnSource(src)}
                    className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 relative ${src.is_active ? 'bg-brand-blue' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${src.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{src.title}</div>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground font-mono truncate block hover:underline">
                      {src.url}
                    </a>
                    {src.last_fetched_at && (
                      <div className="text-xs text-emerald-600 mt-0.5">
                        Последнее обучение: {new Date(src.last_fetched_at).toLocaleDateString('ru')}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeLearnSource(src.id)} className="text-muted-foreground hover:text-red-500 transition flex-shrink-0">
                    <Icon name="Trash2" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── База знаний ── */}
      {tab === 'knowledge' && <>
      <VBKnowledgeHeader
        usage={usage}
        items={items}
        filtered={filtered}
        filter={filter}
        trainingNews={trainingNews}
        onFilterChange={setFilter}
        onTrainOpen={() => setTrainOpen(true)}
        onAddFact={() => setEditing({ key: '', value: '' })}
      />

      <VBRetrainSchedule
        schedule={schedule}
        scheduleLoading={scheduleLoading}
        scheduleSaving={scheduleSaving}
        onScheduleChange={setSchedule}
        onSave={saveSchedule}
      />

      <VBMemoryList
        loading={loading}
        error={error}
        filtered={filtered}
        filter={filter}
        items={items}
        grouped={grouped}
        trainOpen={trainOpen}
        trainingNews={trainingNews}
        selectedSources={selectedSources}
        editing={editing}
        saving={saving}
        onLoad={load}
        onToggleSource={toggleSource}
        onTrainOpen={setTrainOpen}
        onTrainSubmit={trainFromNews}
        onEditOpen={setEditing}
        onEditClose={() => setEditing(null)}
        onEditChange={setEditing}
        onSave={save}
        onRemove={remove}
      />
      </>}
    </div>
  );
}