import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { CadastreObject, EgrnData, EgrnStat } from './cadastreTypes';

interface Props {
  objects: CadastreObject[];
  egrnDataMap: Record<string, EgrnData>;
  egrnLoadingSet: Set<string>;
  egrnStat: EgrnStat | null;
  egrnError: string | null;
  egrnOpen: boolean;
  setEgrnOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  fallbackCadNumber: string;
  onRequestSelected: (cadNumbers: string[]) => void;
}

function EgrnObjectPanel({ cadNumber, objMeta, data, loading }: {
  cadNumber: string;
  objMeta?: CadastreObject;
  data: EgrnData | null;
  loading: boolean;
}) {
  const [open, setOpen] = useState(true);

  const resolvedType = data?.type || objMeta?.type || '';
  const typeIcon = resolvedType === 'Земельный участок' ? 'Landmark'
    : resolvedType === 'Помещение' ? 'DoorOpen'
    : 'Building2';

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={typeIcon} size={13} className="text-brand-blue flex-shrink-0" />
          <span className="font-mono text-xs font-semibold text-foreground truncate">{cadNumber}</span>
          {resolvedType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue font-medium flex-shrink-0">
              {resolvedType}
            </span>
          )}
          {data?.status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${
              data.status === 'Актуально'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : data.status === 'Погашено'
                ? 'bg-gray-100 text-gray-500 border-gray-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {data.status}
            </span>
          )}
          {loading && <Icon name="Loader2" size={11} className="animate-spin text-muted-foreground flex-shrink-0" />}
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={13} className="text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="px-3 py-2.5 space-y-2.5">
          {loading && !data && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Icon name="Loader2" size={12} className="animate-spin" />
              Загружаем данные…
            </div>
          )}
          {data && data.success === 0 && (
            <div className="text-xs text-amber-700 flex items-center gap-1.5">
              <Icon name="AlertTriangle" size={13} />
              {data.message || 'Объект не найден или данные временно недоступны'}
            </div>
          )}
          {data && data.success === 1 && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {data.area && <div><span className="text-muted-foreground">Площадь:</span> <span className="font-medium">{data.area} м²</span></div>}
                {data.floor && <div><span className="text-muted-foreground">Этаж:</span> <span className="font-medium">{data.floor}</span></div>}
                {data.purpose && <div><span className="text-muted-foreground">Назначение:</span> <span className="font-medium">{data.purpose}</span></div>}
                {data.ownership && <div><span className="text-muted-foreground">Собственность:</span> <span className="font-medium">{data.ownership}</span></div>}
                {data.reg_date && <div><span className="text-muted-foreground">Дата регистрации:</span> <span className="font-medium">{data.reg_date}</span></div>}
                {data.cad_cost && <div><span className="text-muted-foreground">Кад. стоимость:</span> <span className="font-medium">{Number(data.cad_cost).toLocaleString('ru')} ₽</span></div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Icon name="Lock" size={11} />Обременения:
                </div>
                {data.encumbrances && data.encumbrances.length > 0 ? (
                  <div className="space-y-1">
                    {data.encumbrances.map((e, i) => (
                      <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-2 py-1 text-red-700">
                        {e.type}{e.date ? ` от ${e.date}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-600 flex items-center gap-1">
                    <Icon name="CheckCircle" size={12} />Не зарегистрированы
                  </div>
                )}
              </div>
              {data.rights && data.rights.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Icon name="Users" size={11} />Права ({data.rights.length}):
                  </div>
                  <div className="space-y-1">
                    {data.rights.map((r, i) => (
                      <div key={i} className="text-xs bg-muted rounded px-2 py-1">
                        <span className="font-medium">{r.type}</span>
                        {r.date && <span className="text-muted-foreground"> от {r.date}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EgrnBlock({
  objects,
  egrnDataMap,
  egrnLoadingSet,
  egrnStat,
  egrnError,
  egrnOpen,
  setEgrnOpen,
  fallbackCadNumber,
  onRequestSelected,
}: Props) {
  const displayObjects: CadastreObject[] = objects.length > 0
    ? objects
    : fallbackCadNumber ? [{ cadastral_number: fallbackCadNumber }] : [];

  // По умолчанию выбран первый объект; пересинхронизируем при смене списка объектов
  const [checked, setChecked] = useState<Set<string>>(new Set<string>());
  const objectsKey = objects.map(o => o.cadastral_number).join(',');

  useEffect(() => {
    if (displayObjects.length > 0) {
      setChecked(new Set([displayObjects[0].cadastral_number]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectsKey]);

  if (!fallbackCadNumber) return null;

  const anyLoading = egrnLoadingSet.size > 0;
  const loadedKeys = Object.keys(egrnDataMap);

  // Объекты у которых уже загружена выписка
  const loadedObjects = displayObjects.filter(o => egrnDataMap[o.cadastral_number]);
  // Объекты которые сейчас грузятся
  const loadingObjects = displayObjects.filter(o => egrnLoadingSet.has(o.cadastral_number));
  // Есть что показывать
  const hasResults = loadedObjects.length > 0 || loadingObjects.length > 0;

  const toggleCheck = (cn: string) => {
    setChecked(prev => {
      const s = new Set(prev);
      if (s.has(cn)) { s.delete(cn); } else { s.add(cn); }
      return s;
    });
  };

  const selectAll = () => setChecked(new Set(displayObjects.map(o => o.cadastral_number)));
  const selectNone = () => setChecked(new Set());

  const handleRequest = () => {
    const selected = [...checked];
    if (!selected.length) return;
    onRequestSelected(selected);
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      {/* ── Заголовок блока ── */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon name="FileSearch" size={15} className="text-brand-blue" />
          Выписка ЕГРН
        </div>
        <div className="flex items-center gap-2">
          {anyLoading && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Icon name="Loader2" size={11} className="animate-spin" />
              Загрузка...
            </span>
          )}
          {egrnStat && !anyLoading && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
              egrnStat.day_used >= egrnStat.day_limit
                ? 'bg-red-50 text-red-600 border-red-200'
                : egrnStat.day_used >= egrnStat.day_limit * 0.8
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              {egrnStat.day_used}/{egrnStat.day_limit} сегодня
            </span>
          )}
          <button
            type="button"
            onClick={() => setEgrnOpen(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <Icon name={egrnOpen ? 'ChevronUp' : 'ChevronDown'} size={12} />
            {egrnOpen ? 'Скрыть' : 'Показать'}
          </button>
        </div>
      </div>

      {egrnOpen && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {egrnError && (
            <div className="text-xs text-red-600 flex items-center gap-1.5">
              <Icon name="AlertCircle" size={13} />{egrnError}
            </div>
          )}

          {/* ── Выбор объектов ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">Выберите объекты для запроса:</span>
              {displayObjects.length > 1 && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={selectAll} className="text-[11px] text-brand-blue hover:underline">Все</button>
                  <span className="text-muted-foreground text-[11px]">/</span>
                  <button type="button" onClick={selectNone} className="text-[11px] text-muted-foreground hover:underline">Снять</button>
                </div>
              )}
            </div>

            {displayObjects.map(obj => {
              const isChecked = checked.has(obj.cadastral_number);
              const isLoaded = !!egrnDataMap[obj.cadastral_number];
              const isLoading = egrnLoadingSet.has(obj.cadastral_number);
              const objType = obj.type || '';
              const typeIcon = objType === 'Земельный участок' ? 'Landmark'
                : objType === 'Помещение' ? 'DoorOpen'
                : 'Building2';

              return (
                <label
                  key={obj.cadastral_number}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    isChecked
                      ? 'border-brand-blue/40 bg-brand-blue/5'
                      : 'border-border bg-white hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-border accent-brand-blue flex-shrink-0"
                    checked={isChecked}
                    onChange={() => toggleCheck(obj.cadastral_number)}
                  />
                  <Icon name={typeIcon} size={13} className="text-brand-blue flex-shrink-0" />
                  <span className="font-mono text-xs font-medium text-foreground truncate flex-1">{obj.cadastral_number}</span>
                  {objType && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue font-medium flex-shrink-0">{objType}</span>
                  )}
                  {obj.area && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{obj.area} м²</span>
                  )}
                  {isLoading && <Icon name="Loader2" size={11} className="animate-spin text-muted-foreground flex-shrink-0" />}
                  {isLoaded && !isLoading && <Icon name="CheckCircle" size={12} className="text-emerald-500 flex-shrink-0" />}
                </label>
              );
            })}

            <button
              type="button"
              onClick={handleRequest}
              disabled={checked.size === 0 || anyLoading}
              className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition-colors"
            >
              {anyLoading
                ? <><Icon name="Loader2" size={13} className="animate-spin" />Загружаем…</>
                : <><Icon name="FileSearch" size={13} />Запросить выписк{checked.size === 1 ? 'у' : 'и'} ({checked.size})</>
              }
            </button>
          </div>

          {/* ── Результаты ── */}
          {hasResults && (
            <div className="space-y-2 pt-1 border-t border-border/50">
              {[...loadingObjects, ...loadedObjects.filter(o => !egrnLoadingSet.has(o.cadastral_number))].map(obj => (
                <EgrnObjectPanel
                  key={obj.cadastral_number}
                  cadNumber={obj.cadastral_number}
                  objMeta={obj}
                  data={egrnDataMap[obj.cadastral_number] ?? null}
                  loading={egrnLoadingSet.has(obj.cadastral_number)}
                />
              ))}
            </div>
          )}

          {/* ── Лимиты ── */}
          {egrnStat && loadedKeys.length > 0 && (
            <div className="pt-1 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50">
              <span>Использовано: {egrnStat.day_used}/{egrnStat.day_limit} сегодня · {egrnStat.month_used}/{egrnStat.month_limit} за месяц</span>
              {egrnStat.paid_till && <span>Оплачено до: {egrnStat.paid_till}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}