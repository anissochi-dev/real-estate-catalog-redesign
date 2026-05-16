import Icon from '@/components/ui/icon';
import { City } from './types';

interface Props {
  cities: City[];
  cityQuery: string;
  setCityQuery: (v: string) => void;
  cityAdding: boolean;
  aiAddCity: () => void;
  toggleCity: (c: City) => void;
}

export default function CitiesTab({
  cities, cityQuery, setCityQuery, cityAdding, aiAddCity, toggleCity,
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="font-display font-700 text-lg mb-4">Города</div>

      <div className="flex gap-2 mb-4">
        <input className="flex-1 px-3 py-2 border rounded-lg text-sm"
          placeholder="Название нового города (например: Геленджик)"
          value={cityQuery} onChange={e => setCityQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && aiAddCity()} />
        <button onClick={aiAddCity} disabled={cityAdding || !cityQuery.trim()}
          className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          <Icon name="Sparkles" size={14} />
          {cityAdding ? 'Добавляем...' : 'Добавить через ИИ'}
        </button>
      </div>

      <div className="space-y-2">
        {cities.map(c => (
          <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <div className="font-semibold">{c.name}</div>
              {c.region && <div className="text-xs text-muted-foreground">{c.region}</div>}
            </div>
            <button onClick={() => toggleCity(c)}
              className={`text-xs px-3 py-1 rounded-lg font-semibold ${
                c.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-muted hover:bg-muted/70'
              }`}>
              {c.is_active ? 'Активен' : 'Скрыт'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
