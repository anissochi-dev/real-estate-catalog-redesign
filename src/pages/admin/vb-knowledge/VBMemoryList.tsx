import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { MemoryItem, TRAINING_SOURCES, categoryByKey, fmtDate } from './types';

const PAGE_SIZE = 30;

interface Props {
  loading: boolean;
  error: string;
  filtered: MemoryItem[];
  filter: string;
  items: MemoryItem[];
  grouped: Record<string, MemoryItem[]>;
  trainOpen: boolean;
  trainingNews: boolean;
  selectedSources: string[];
  editing: Partial<MemoryItem> | null;
  saving: boolean;
  onLoad: () => void;
  onToggleSource: (id: string) => void;
  onTrainOpen: (open: boolean) => void;
  onTrainSubmit: () => void;
  onEditOpen: (item: Partial<MemoryItem>) => void;
  onEditClose: () => void;
  onEditChange: (item: Partial<MemoryItem>) => void;
  onSave: () => void;
  onRemove: (id: number) => void;
}

export default function VBMemoryList({
  loading, error, filtered, filter, items, grouped,
  trainOpen, trainingNews, selectedSources,
  editing, saving,
  onLoad, onToggleSource, onTrainOpen, onTrainSubmit,
  onEditOpen, onEditClose, onEditChange, onSave, onRemove,
}: Props) {
  const [page, setPage] = useState(0);
  // Сброс страницы при смене фильтра
  const prevFilterRef = useState(filter);
  if (prevFilterRef[0] !== filter) { prevFilterRef[0] = filter; if (page !== 0) setPage(0); }

  // Плоский список с пагинацией — сбрасываем страницу при смене фильтра
  const allItems = filtered;
  const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageItems = allItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Группируем только текущую страницу
  const pageGrouped: Record<string, MemoryItem[]> = {};
  pageItems.forEach(it => {
    const cat = categoryByKey(it.key);
    (pageGrouped[cat] = pageGrouped[cat] || []).push(it);
  });

  return (
    <>
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
            <button onClick={onLoad} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-50 inline-flex items-center gap-1">
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

      {/* Счётчик и пагинация сверху */}
      {!loading && !error && allItems.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Всего фактов: <strong className="text-foreground">{allItems.length}</strong>
            {totalPages > 1 && <> · страница <strong className="text-foreground">{safePage + 1}</strong> из {totalPages}</>}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-1 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="ChevronLeft" size={13} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => {
                // Показываем: первую, последнюю, текущую ±1
                const show = i === 0 || i === totalPages - 1 || Math.abs(i - safePage) <= 1;
                const ellipsisBefore = i === 1 && safePage > 2;
                const ellipsisAfter = i === totalPages - 2 && safePage < totalPages - 3;
                if (!show) return null;
                return (
                  <span key={i} className="flex items-center gap-1">
                    {ellipsisBefore && <span className="text-muted-foreground text-xs px-0.5">…</span>}
                    <button
                      onClick={() => setPage(i)}
                      className={`w-7 h-7 rounded-lg text-xs font-medium border transition ${i === safePage ? 'bg-brand-blue text-white border-brand-blue' : 'border-border hover:bg-muted'}`}
                    >
                      {i + 1}
                    </button>
                    {ellipsisAfter && <span className="text-muted-foreground text-xs px-0.5">…</span>}
                  </span>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage === totalPages - 1}
                className="px-2 py-1 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="ChevronRight" size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Факты сгруппированные по категориям (только текущая страница) */}
      {Object.entries(pageGrouped).map(([cat, list]) => (
        <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</span>
            <span className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">{list.length}</span>
          </div>
          <div className="divide-y divide-border">
            {list.map(it => (
              <div key={it.id} className="flex items-start gap-2 px-4 py-2 group hover:bg-muted/20 transition">
                <div className="flex-1 min-w-0 grid grid-cols-[160px_1fr] gap-x-3 items-start">
                  <div className="text-[11px] font-mono text-brand-blue truncate pt-0.5" title={it.key}>{it.key}</div>
                  <div className="text-xs text-foreground/90 leading-relaxed line-clamp-2" title={it.value}>{it.value}</div>
                </div>
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-muted-foreground/50 mr-1">{fmtDate(it.updated_at)}</span>
                  <button onClick={() => onEditOpen(it)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-brand-blue" title="Редактировать">
                    <Icon name="Pencil" size={12} />
                  </button>
                  <button onClick={() => onRemove(it.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Удалить">
                    <Icon name="Trash2" size={12} />
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
              <button onClick={() => onTrainOpen(false)} disabled={trainingNews} className="p-1 hover:bg-muted rounded disabled:opacity-50">
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
                        onChange={() => onToggleSource(src.id)}
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
                onClick={() => onTrainOpen(false)}
                disabled={trainingNews}
                className="px-4 py-2 rounded-xl text-sm hover:bg-muted disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={onTrainSubmit}
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
              <button onClick={onEditClose} className="p-1 hover:bg-muted rounded">
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
                  onChange={e => onEditChange({ ...editing, key: e.target.value })}
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
                  onChange={e => onEditChange({ ...editing, value: e.target.value })}
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  Максимум 5000 символов. Текущая длина: {(editing.value || '').length}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={onEditClose}
                className="px-4 py-2 rounded-xl text-sm hover:bg-muted"
              >
                Отмена
              </button>
              <button
                onClick={onSave}
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
    </>
  );
}