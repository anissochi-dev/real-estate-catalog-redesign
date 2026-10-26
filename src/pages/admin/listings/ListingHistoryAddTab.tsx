import Icon from '@/components/ui/icon';
import { MultiStats, SOURCES, EVENT_TYPES, EVENT_LABELS_FALLBACK, fmtDt } from './listingHistoryUtils';

interface Props {
  multiStats: MultiStats | null;
  addSource: string;
  setAddSource: (v: string) => void;
  addEvent: string;
  setAddEvent: (v: string) => void;
  addCount: string;
  setAddCount: (v: string) => void;
  addNote: string;
  setAddNote: (v: string) => void;
  addLoading: boolean;
  addOk: boolean;
  handleAddStat: () => void;
}

export default function ListingHistoryAddTab({
  multiStats, addSource, setAddSource, addEvent, setAddEvent, addCount, setAddCount,
  addNote, setAddNote, addLoading, addOk, handleAddStat,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Вручную вносите показатели с Авито, ЦИАН, Яндекс Недвижимости и других площадок.
        Эти данные отобразятся в сводке и по площадкам.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Площадка</label>
          <select className="w-full px-3 py-2 border rounded-lg text-sm"
            value={addSource} onChange={e => setAddSource(e.target.value)}>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Тип события</label>
          <select className="w-full px-3 py-2 border rounded-lg text-sm"
            value={addEvent} onChange={e => setAddEvent(e.target.value)}>
            {EVENT_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Количество</label>
        <input type="number" min="1" className="w-full px-3 py-2 border rounded-lg text-sm"
          value={addCount} onChange={e => setAddCount(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Комментарий (необязательно)</label>
        <input className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Например: данные за май 2026"
          value={addNote} onChange={e => setAddNote(e.target.value)} />
      </div>
      <button onClick={handleAddStat} disabled={addLoading}
        className="w-full btn-blue text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
        {addLoading ? <><Icon name="Loader2" size={15} className="animate-spin" /> Сохранение...</> : <><Icon name="Plus" size={15} /> Добавить запись</>}
      </button>
      {addOk && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
          <Icon name="CheckCircle2" size={15} />
          Данные сохранены
        </div>
      )}

      {/* История ручных записей */}
      {multiStats?.history && multiStats.history.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Последние записи</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {multiStats.history.filter(h => h.event_type !== 'view_site').slice(0, 20).map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold">{multiStats.source_labels?.[h.source] || SOURCES.find(s => s.value === h.source)?.label || h.source}</span>
                  <span className="text-muted-foreground">{multiStats.event_labels?.[h.event_type] || EVENT_LABELS_FALLBACK[h.event_type] || h.event_type}</span>
                  {h.note && <span className="text-muted-foreground truncate">— {h.note}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-700 text-brand-blue">+{h.count}</span>
                  <span className="text-muted-foreground">{fmtDt(h.recorded_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
