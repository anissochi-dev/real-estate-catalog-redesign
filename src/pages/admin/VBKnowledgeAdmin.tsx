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

const SUGGESTED_KEYS = [
  { prefix: 'glossary_', label: 'Глоссарий' },
  { prefix: 'faq_', label: 'FAQ' },
  { prefix: 'rule_', label: 'Бизнес-правило' },
  { prefix: 'contact_', label: 'Контакты/компания' },
  { prefix: 'process_', label: 'Процесс' },
  { prefix: 'persona', label: 'Личность ВБ' },
];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<string>('');
  const [editing, setEditing] = useState<Partial<MemoryItem> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    adminApi.listAiMemory()
      .then(d => {
        setItems(Array.isArray(d?.items) ? d.items : []);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить базу знаний');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
          <button
            onClick={() => setEditing({ key: '', value: '' })}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
          >
            <Icon name="Plus" size={15} /> Добавить факт
          </button>
        </div>

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
