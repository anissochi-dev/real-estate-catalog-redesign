import Icon from '@/components/ui/icon';
import { EgrnData, EgrnStat } from './cadastreTypes';

interface Props {
  cadastralNumber: string;
  egrnData: EgrnData | null;
  egrnStat: EgrnStat | null;
  egrnLoading: boolean;
  egrnError: string | null;
  egrnOpen: boolean;
  setEgrnOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export default function EgrnBlock({
  cadastralNumber,
  egrnData,
  egrnStat,
  egrnLoading,
  egrnError,
  egrnOpen,
  setEgrnOpen,
}: Props) {
  if (!cadastralNumber) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      {/* Заголовок */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon name="FileSearch" size={15} className="text-brand-blue" />
          Выписка ЕГРН
        </div>
        <div className="flex items-center gap-2">
          {egrnLoading && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Icon name="Loader2" size={11} className="animate-spin" />
              Загрузка...
            </span>
          )}
          {egrnStat && !egrnLoading && (
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
          {(egrnData || egrnError) && !egrnLoading && (
            <button
              type="button"
              onClick={() => setEgrnOpen(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <Icon name={egrnOpen ? 'ChevronUp' : 'ChevronDown'} size={12} />
              {egrnOpen ? 'Скрыть' : 'Показать'}
            </button>
          )}
        </div>
      </div>

      {/* Результат */}
      {egrnOpen && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {egrnError && (
            <div className="text-xs text-red-600 flex items-center gap-1.5">
              <Icon name="AlertCircle" size={13} />
              {egrnError}
            </div>
          )}
          {egrnData && egrnData.success === 0 && (
            <div className="text-xs text-amber-700 flex items-center gap-1.5">
              <Icon name="AlertTriangle" size={13} />
              {egrnData.message || 'Объект не найден или данные временно недоступны'}
            </div>
          )}
          {egrnData && egrnData.success === 1 && (
            <div className="space-y-2.5">
              {/* Основные данные */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {egrnData.type && (
                  <div><span className="text-muted-foreground">Тип:</span> <span className="font-medium">{egrnData.type}</span></div>
                )}
                {egrnData.status && (
                  <div><span className="text-muted-foreground">Статус:</span> <span className={`font-medium ${egrnData.status === 'Актуально' ? 'text-emerald-600' : ''}`}>{egrnData.status}</span></div>
                )}
                {egrnData.area && (
                  <div><span className="text-muted-foreground">Площадь:</span> <span className="font-medium">{egrnData.area} м²</span></div>
                )}
                {egrnData.floor && (
                  <div><span className="text-muted-foreground">Этаж:</span> <span className="font-medium">{egrnData.floor}</span></div>
                )}
                {egrnData.purpose && (
                  <div><span className="text-muted-foreground">Назначение:</span> <span className="font-medium">{egrnData.purpose}</span></div>
                )}
                {egrnData.ownership && (
                  <div><span className="text-muted-foreground">Собственность:</span> <span className="font-medium">{egrnData.ownership}</span></div>
                )}
                {egrnData.reg_date && (
                  <div><span className="text-muted-foreground">Дата регистрации:</span> <span className="font-medium">{egrnData.reg_date}</span></div>
                )}
                {egrnData.cad_cost && (
                  <div><span className="text-muted-foreground">Кад. стоимость:</span> <span className="font-medium">{Number(egrnData.cad_cost).toLocaleString('ru')} ₽</span></div>
                )}
              </div>

              {/* Обременения */}
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Icon name="Lock" size={11} />
                  Обременения:
                </div>
                {egrnData.encumbrances && egrnData.encumbrances.length > 0 ? (
                  <div className="space-y-1">
                    {egrnData.encumbrances.map((e, i) => (
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
              {egrnData.rights && egrnData.rights.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Icon name="Users" size={11} />
                    Права ({egrnData.rights.length}):
                  </div>
                  <div className="space-y-1">
                    {egrnData.rights.map((r, i) => (
                      <div key={i} className="text-xs bg-muted rounded px-2 py-1">
                        <span className="font-medium">{r.type}</span>
                        {r.date && <span className="text-muted-foreground"> от {r.date}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Лимиты */}
              {egrnStat && (
                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Использовано: {egrnStat.day_used}/{egrnStat.day_limit} сегодня · {egrnStat.month_used}/{egrnStat.month_limit} за месяц</span>
                  {egrnStat.paid_till && <span>Оплачено до: {egrnStat.paid_till}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
