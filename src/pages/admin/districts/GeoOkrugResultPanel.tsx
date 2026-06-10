import Icon from '@/components/ui/icon';
import { ALL_PROVIDERS, GeoOkrugResult } from './geoTypes';

export default function GeoOkrugResultPanel({ result, applying, onClose, onApply }: {
  result: GeoOkrugResult; applying: boolean; onClose: () => void; onApply: () => void;
}) {
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-orange-800 flex items-center gap-2">
            <Icon name="Globe" size={16} /> Округа по улицам
          </div>
          <div className="text-sm text-orange-700 mt-0.5">
            Улиц обработано: <b>{result.total_streets}</b> &nbsp;·&nbsp;
            Округ определён: <b>{result.matched_count}</b> &nbsp;·&nbsp;
            Не определено: <b>{result.not_found_count}</b>
          </div>
          {result.provider_stats && (
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(result.provider_stats).filter(([, v]) => v > 0).map(([p, v]) => (
                <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  {ALL_PROVIDERS.find(x => x.id === p)?.label ?? p}: {v}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-100 transition">
            Закрыть
          </button>
          {result.matched_count > 0 && (
            <button onClick={onApply} disabled={applying}
              className="text-sm px-4 py-1.5 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 transition disabled:opacity-50 flex items-center gap-1.5">
              <Icon name={applying ? 'Loader2' : 'Check'} size={14} className={applying ? 'animate-spin' : ''} />
              Сохранить {result.matched_count} округов
            </button>
          )}
        </div>
      </div>
      {result.results.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-orange-50 text-orange-700 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2">Улица</th>
                <th className="text-left px-3 py-2">Округ</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Suburb</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">City district</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Источник</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {result.results.map((r, i) => (
                <tr key={i} className={r.okrug ? '' : 'opacity-50'}>
                  <td className="px-3 py-2 font-medium">{r.street}</td>
                  <td className="px-3 py-2">
                    {r.okrug
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">{r.okrug}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.suburb || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.city_district || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{r.provider || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
