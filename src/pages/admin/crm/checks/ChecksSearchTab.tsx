import React from 'react';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SOURCE_INFO, CHECK_TYPES, ZachestnyData, DadataData, CheckResult } from './checksTypes';
import ZachestnyCard from './ZachestnyCard';
import CheckoCard from './CheckoCard';
import DadataCard from './DadataCard';
import EgrnCard, { EgrnData } from './EgrnCard';

function renderValue(val: unknown, depth = 0): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof val === 'boolean') return <Badge variant={val ? 'default' : 'outline'}>{val ? 'Да' : 'Нет'}</Badge>;
  if (typeof val === 'string' || typeof val === 'number') return <span>{String(val)}</span>;
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="text-muted-foreground">Пусто</span>;
    return (
      <div className="space-y-1">
        {val.slice(0, 5).map((item, i) => (
          <div key={i} className={depth > 0 ? 'ml-3 border-l border-border pl-2' : ''}>
            {renderValue(item, depth + 1)}
          </div>
        ))}
        {val.length > 5 && <div className="text-xs text-muted-foreground">...ещё {val.length - 5}</div>}
      </div>
    );
  }
  if (typeof val === 'object') {
    return (
      <div className="space-y-1">
        {Object.entries(val as Record<string, unknown>).slice(0, 15).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground min-w-[100px] flex-shrink-0">{k}:</span>
            <span className="break-all">{renderValue(v, depth + 1)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(val)}</span>;
}

interface AddressFound {
  cadastral_number: string;
  address: string;
  area: string;
  purpose: string;
}

interface AddressSearchData {
  found?: AddressFound[];
  error?: string;
  geocoded_address?: string;
  lat?: number;
  lon?: number;
}

function AddressSearchResult({
  data,
  onSelect,
}: {
  data: AddressSearchData;
  onSelect: (num: string) => void;
}) {
  if (data.error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        <Icon name="AlertTriangle" size={16} className="shrink-0 text-amber-600" />
        {data.error}
      </div>
    );
  }
  if (!data.found?.length) return null;
  return (
    <div className="space-y-2">
      {data.geocoded_address && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon name="MapPin" size={12} />
          Геокодирован как: <span className="font-medium text-foreground">{data.geocoded_address}</span>
        </div>
      )}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        Найдено объектов: {data.found.length}
      </div>
      {data.found.map((obj, i) => (
        <button
          key={i}
          onClick={() => onSelect(obj.cadastral_number)}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-brand-blue hover:bg-brand-blue/5 transition text-left group"
        >
          <div className="min-w-0">
            <div className="text-xs font-mono font-semibold text-brand-blue">{obj.cadastral_number}</div>
            {obj.address && <div className="text-xs text-muted-foreground mt-0.5 truncate">{obj.address}</div>}
            <div className="flex gap-3 mt-1">
              {obj.area && <span className="text-[11px] text-muted-foreground">{obj.area} м²</span>}
              {obj.purpose && <span className="text-[11px] text-muted-foreground">{obj.purpose}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-brand-blue opacity-0 group-hover:opacity-100 transition shrink-0">
            <Icon name="Search" size={12} />
            Проверить ЕГРН
          </div>
        </button>
      ))}
    </div>
  );
}

interface Props {
  checkType: string;
  setCheckType: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  selectedSources: string[];
  toggleSource: (s: string) => void;
  serviceStatus: Record<string, boolean>;
  results: Record<string, CheckResult> | null;
  isPending: boolean;
  onRun: () => void;
  searchMode?: 'cadastral' | 'address';
  setSearchMode?: (m: 'cadastral' | 'address') => void;
  onCheckOwner?: (name: string) => void;
}

export default function ChecksSearchTab({
  checkType, setCheckType, query, setQuery,
  selectedSources, toggleSource, serviceStatus,
  results, isPending, onRun,
  searchMode = 'cadastral', setSearchMode,
  onCheckOwner,
}: Props) {
  const isProperty = checkType === 'property';

  const placeholder = isProperty
    ? (searchMode === 'address' ? 'Краснодар, ул. Красная, 1' : '23:43:0401003:123')
    : CHECK_TYPES.find(c => c.id === checkType)?.placeholder;

  const isAddressMode = isProperty && searchMode === 'address';

  return (
    <div className="space-y-4">

      {/* Поле ввода */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-3">

        {/* Переключатель режима — только для Недвижимость */}
        {isProperty && setSearchMode && (
          <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
            <button
              onClick={() => { setSearchMode('cadastral'); setQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                searchMode === 'cadastral' ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="Hash" size={12} />
              По кадастровому номеру
            </button>
            <button
              onClick={() => { setSearchMode('address'); setQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                searchMode === 'address' ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="MapPin" size={12} />
              По адресу
            </button>
          </div>
        )}

        {!isProperty && (
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {CHECK_TYPES.find(c => c.id === checkType)?.label}
          </label>
        )}

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && query.trim() && !isPending && onRun()}
          />
          <Button
            className="bg-brand-blue text-white"
            disabled={!query.trim() || selectedSources.length === 0 || isPending}
            onClick={onRun}
          >
            {isPending
              ? <Icon name="Loader2" size={15} className="animate-spin" />
              : <Icon name={isAddressMode ? 'MapPin' : 'Search'} size={15} />
            }
          </Button>
        </div>
      </div>

      {/* Результат поиска по адресу — список объектов для выбора */}
      {isAddressMode && results?.egrn?.data && (
        <AddressSearchResult
          data={results.egrn.data as AddressSearchData}
          onSelect={(num) => {
            setQuery(num);
            if (setSearchMode) setSearchMode('cadastral');
          }}
        />
      )}

      {/* Результаты (ЕГРН карточка или другие источники) */}
      {results && !isAddressMode && (
        <div className="space-y-3">
          {Object.entries(results).map(([src, res]) => (
            <div key={src} className="bg-white rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_INFO[src]?.color || 'bg-muted text-foreground'}`}>
                    {SOURCE_INFO[src]?.label || src}
                  </span>
                  {res.from_cache && <Badge variant="outline" className="text-xs">Из кэша</Badge>}
                </div>
                {src === 'zachestny' && res.data && !(res.data as Record<string, unknown>).error && (
                  <a
                    href={`https://zachestnyibiznes.ru/company/ul/${(res.data as Record<string, unknown>).ogrn || (res.data as Record<string, unknown>).inn}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-blue hover:underline flex items-center gap-1"
                  >
                    <Icon name="ExternalLink" size={12} />
                    Открыть на сайте
                  </a>
                )}
              </div>
              {res.error ? (
                <div className="text-red-600 text-sm flex items-center gap-2">
                  <Icon name="AlertCircle" size={15} />
                  {res.error}
                </div>
              ) : src === 'zachestny' && res.data && !(res.data as Record<string, unknown>).error ? (
                <ZachestnyCard data={res.data as ZachestnyData} />
              ) : src === 'checko' && res.data ? (
                <CheckoCard data={res.data as Parameters<typeof CheckoCard>[0]['data']} />
              ) : src === 'dadata' && res.data && !(res.data as Record<string, unknown>).error ? (
                <DadataCard data={res.data as DadataData} />
              ) : src === 'egrn' && res.data ? (
                <EgrnCard data={res.data as EgrnData} onCheckOwner={onCheckOwner} />
              ) : (
                <div className="text-sm">{renderValue(res.data)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}