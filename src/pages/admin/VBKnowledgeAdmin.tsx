import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { MemoryItem, Usage, RetrainSchedule, TRAINING_SOURCES, categoryByKey } from './vb-knowledge/types';
import VBKnowledgeHeader from './vb-knowledge/VBKnowledgeHeader';
import VBRetrainSchedule from './vb-knowledge/VBRetrainSchedule';
import VBMemoryList from './vb-knowledge/VBMemoryList';

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

  const grouped: Record<string, MemoryItem[]> = {};
  filtered.forEach(it => {
    const cat = categoryByKey(it.key);
    (grouped[cat] = grouped[cat] || []).push(it);
  });

  return (
    <div className="space-y-4 max-w-5xl">
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
    </div>
  );
}
