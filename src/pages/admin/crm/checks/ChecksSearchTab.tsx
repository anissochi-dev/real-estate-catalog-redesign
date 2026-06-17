import React from 'react';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SOURCE_INFO, CHECK_TYPES, ZachestnyData, CheckResult } from './checksTypes';
import ZachestnyCard from './ZachestnyCard';
import CheckoCard from './CheckoCard';

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
}

export default function ChecksSearchTab({
  checkType, setCheckType, query, setQuery,
  selectedSources, toggleSource, serviceStatus,
  results, isPending, onRun,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Тип проверки</label>
            <div className="flex flex-col gap-2 mt-2">
              {CHECK_TYPES.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => setCheckType(ct.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition ${checkType === ct.id ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border hover:bg-muted'}`}
                >
                  <Icon name={ct.icon} size={16} />
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Источники</label>
            <div className="flex flex-col gap-2 mt-2">
              {Object.entries(SOURCE_INFO).map(([src, info]) => {
                const connected = serviceStatus[src];
                const selected = selectedSources.includes(src);
                return (
                  <button
                    key={src}
                    onClick={() => toggleSource(src)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-sm transition ${selected ? 'border-brand-blue bg-brand-blue/5' : 'border-border opacity-60'}`}
                  >
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${info.color}`}>{info.label}</span>
                        {connected === true && (
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                            <Icon name="Wifi" size={10} />подключён
                          </span>
                        )}
                        {connected === false && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Icon name="WifiOff" size={10} />нет ключа
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{info.desc}</div>
                    </div>
                    <Icon name={selected ? 'CheckCircle2' : 'Circle'} size={16} className={selected ? 'text-brand-blue' : 'text-muted-foreground'} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-2xl border border-border p-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {CHECK_TYPES.find(c => c.id === checkType)?.label}
          </label>
          <div className="flex gap-2 mt-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={CHECK_TYPES.find(c => c.id === checkType)?.placeholder}
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && query.trim() && !isPending && onRun()}
            />
            <Button
              className="bg-brand-blue text-white"
              disabled={!query.trim() || selectedSources.length === 0 || isPending}
              onClick={onRun}
            >
              {isPending ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Search" size={15} />}
            </Button>
          </div>
        </div>

        {results && (
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
                ) : (
                  <div className="text-sm">{renderValue(res.data)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}