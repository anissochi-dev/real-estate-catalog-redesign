import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { City, ROAD_LINES } from './types';
import { District } from '@/lib/api';
import { Suggestion } from './cadastreTypes';
import type { Listing } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
  districts: District[];
  hasError?: boolean;
  districtError?: boolean;
  currentCity: string;
  streetInput: string;
  setStreetInput: (v: string) => void;
  suggestions: Suggestion[];
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  highlightIdx: number;
  setHighlightIdx: (v: number | ((prev: number) => number)) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  dropdownRef: React.RefObject<HTMLDivElement>;
  onCoordsManualChange?: (manual: boolean) => void;
  fetchSuggestions: (query: string) => void;
  pickSuggestion: (s: Suggestion) => void;
  geocodeAddress: (fullAddr: string, streetOnly?: string) => void;
}

export default function AddressInputRow({
  editing,
  setEditing,
  cities,
  districts,
  hasError,
  districtError,
  currentCity,
  streetInput,
  setStreetInput,
  suggestions,
  showSuggestions,
  setShowSuggestions,
  highlightIdx,
  setHighlightIdx,
  inputRef,
  dropdownRef,
  onCoordsManualChange,
  fetchSuggestions,
  pickSuggestion,
  geocodeAddress,
}: Props) {
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        pickSuggestion(suggestions[highlightIdx]);
      } else {
        const v = streetInput.trim();
        if (v) {
          setShowSuggestions(false);
          geocodeAddress(`${currentCity}, ${v}`, v);
        }
      }
    }
  };

  return (
    <>
      <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
        <Icon name="MapPin" size={15} className="text-brand-blue" />
        Расположение
        {hasError && (
          <span className="text-xs font-normal text-red-600 flex items-center gap-1">
            <Icon name="AlertCircle" size={12} />
            Укажите расположение объекта *
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Город</label>
          <select
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            value={currentCity}
            onChange={e => {
              setStreetInput('');
              onCoordsManualChange?.(false);
              setEditing({ ...editing, city: e.target.value, address: '', lat: null, lng: null });
            }}
          >
            {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 relative">
          <label className="text-xs text-muted-foreground block mb-1">
            Улица и дом (начните вводить — появятся подсказки)
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              className="w-full px-3 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              placeholder="напр. Красная, 1"
              value={streetInput}
              onChange={e => {
                setStreetInput(e.target.value);
                fetchSuggestions(e.target.value);
                onCoordsManualChange?.(false);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleInputKeyDown}
              onBlur={e => {
                const v = e.target.value.trim();
                setTimeout(() => {
                  if (!v) return;
                  if (showSuggestions) return;
                  if (v === (editingRef.current.address || '')) return;
                  geocodeAddress(`${currentCity}, ${v}`, v);
                }, 200);
              }}
            />
            <Icon name="Search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={`${s.value}-${i}`}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                    i === highlightIdx ? 'bg-brand-blue/10 text-brand-blue' : 'hover:bg-muted'
                  }`}
                >
                  <Icon name="MapPin" size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{s.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold block mb-1">
          Район <span className="text-red-500">*</span>
          {districtError && <span className="ml-2 text-red-500 font-normal">— обязательное поле</span>}
        </label>
        {districts.length > 0 ? (
          <select
            value={editing.district || ''}
            onChange={e => setEditing({ ...editing, district: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none transition-colors ${districtError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-border focus:border-brand-blue'}`}
          >
            <option value="">— выберите район —</option>
            {districts.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={editing.district || ''}
            onChange={e => setEditing({ ...editing, district: e.target.value })}
            placeholder="Введите район вручную"
            className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${districtError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-border focus:border-brand-blue'}`}
          />
        )}
        <div className="text-xs text-muted-foreground mt-1">
          Определяется автоматически по адресу или выбирается вручную
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Линия расположения</label>
        <select
          className="w-full sm:w-1/2 px-3 py-2 border rounded-lg text-sm bg-white"
          value={editing.road_line || ''}
          onChange={e => setEditing({ ...editing, road_line: e.target.value })}
        >
          <option value="">— Не указано —</option>
          {ROAD_LINES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
        </select>
      </div>
    </>
  );
}
