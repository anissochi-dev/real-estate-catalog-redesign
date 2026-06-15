import { useState } from 'react';
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
}

function EgrnObjectPanel({ cadNumber, data, loading }: { cadNumber: string; data: EgrnData | null; loading: boolean }) {
  const [open, setOpen] = useState(true);

  const typeIcon = data?.type === 'Земельный участок' ? 'Landmark'
    : data?.type === 'Помещение' ? 'DoorOpen'
    : 'Building2';

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Заголовок секции */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={typeIcon} size={13} className="text-brand-blue flex-shrink-0" />
          <span className="font-mono text-xs font-semibold text-foreground truncate">{cadNumber}</span>
          {data?.type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue font-medium flex-shrink-0">
              {data.type}
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
          {loading && (
            <Icon name="Loader2" size={11} className="animate-spin text-muted-foreground flex-shrink-0" />
          )}
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={13} className="text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {/* Тело секции */}
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
              {/* Основные данные */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {data.area && (
                  <div><span className="text-muted-foreground">Площадь:</span> <span className="font-medium">{data.area} м²</span></div>
                )}
                {data.floor && (
                  <div><span className="text-muted-foreground">Этаж:</span> <span className="font-medium">{data.floor}</span></div>
                )}
                {data.purpose && (
                  <div><span className="text-muted-foreground">Назначение:</span> <span className="font-medium">{data.purpose}</span></div>
                )}
                {data.ownership && (
                  <div><span className="text-muted-foreground">Собственность:</span> <span className="font-medium">{data.ownership}</span></div>
                )}
                {data.reg_date && (
                  <div><span className="text-muted-foreground">Дата регистрации:</span> <span className="font-medium">{data.reg_date}</span></div>
                )}
                {data.cad_cost && (
                  <div><span className="text-muted-foreground">Кад. стоимость:</span> <span className="font-medium">{Number(data.cad_cost).toLocaleString('ru')} ₽</span></div>
                )}
              </div>

              {/* Обременения */}
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Icon name="Lock" size={11} />
                  Обременения:
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
                    <Icon name="CheckCircle" size={12} />
                    Не зарегистрированы
                  </div>
                )}
              </div>

              {/* Права */}
              {data.rights && data.rights.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Icon name="Users" size={11} />
                    Права ({data.rights.length}):
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
}: Props) {
  if (!fallbackCadNumber) return null;

  // Если объектов нет (ещё не загружены) — показываем хотя бы fallback
  const displayObjects: CadastreObject[] = objects.length > 0
    ? objects
    : [{ cadastral_number: fallbackCadNumber }];

  const anyLoading = egrnLoadingSet.size > 0;

  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      {/* Заголовок блока */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon name="FileSearch" size={15} className="text-brand-blue" />
          Выписка ЕГРН
          {displayObjects.length > 1 && (
            <span className="text-[11px] text-muted-foreground font-normal">({displayObjects.length} объекта)</span>
          )}
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

      {/* Список объектов */}
      {egrnOpen && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {egrnError && (
            <div className="text-xs text-red-600 flex items-center gap-1.5">
              <Icon name="AlertCircle" size={13} />
              {egrnError}
            </div>
          )}

          {displayObjects.map(obj => (
            <EgrnObjectPanel
              key={obj.cadastral_number}
              cadNumber={obj.cadastral_number}
              data={egrnDataMap[obj.cadastral_number] ?? null}
              loading={egrnLoadingSet.has(obj.cadastral_number)}
            />
          ))}

          {/* Лимиты */}
          {egrnStat && (
            <div className="pt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Использовано: {egrnStat.day_used}/{egrnStat.day_limit} сегодня · {egrnStat.month_used}/{egrnStat.month_limit} за месяц</span>
              {egrnStat.paid_till && <span>Оплачено до: {egrnStat.paid_till}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
