import Icon from '@/components/ui/icon';
import { GeoFixResult } from './geoTypes';

export default function GeoFixResultPanel({ result, applying, onClose, onApply }: {
  result: GeoFixResult; applying: boolean; onClose: () => void; onApply: () => void;
}) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-emerald-800 flex items-center gap-2">
            <Icon name="MapPinCheck" size={16} /> Исправление районов объектов
          </div>
          <div className="text-sm text-emerald-700 mt-0.5">
            Будет изменено: <b>{result.changed_count}</b> &nbsp;·&nbsp;
            Без изменений: <b>{result.unchanged_count}</b> &nbsp;·&nbsp;
            Не найдено: <b>{result.not_found_count}</b>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition">
            Отмена
          </button>
          {result.changed_count > 0 && (
            <button onClick={onApply} disabled={applying}
              className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1.5">
              <Icon name={applying ? 'Loader2' : 'Check'} size={14} className={applying ? 'animate-spin' : ''} />
              Применить {result.changed_count} исправлений
            </button>
          )}
        </div>
      </div>
      {result.changed.length > 0 && (
        <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-emerald-50 text-emerald-700 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Адрес</th>
                <th className="px-3 py-2 text-left">Было</th>
                <th className="px-3 py-2 text-left">Станет</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100">
              {result.changed.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-muted-foreground font-mono">#{r.id}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.address}</td>
                  <td className="px-3 py-2 text-red-600 line-through text-xs">{r.district_old}</td>
                  <td className="px-3 py-2 text-emerald-700 font-semibold text-xs">{r.district_new}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
