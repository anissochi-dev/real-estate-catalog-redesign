import Icon from '@/components/ui/icon';
import { CRITICAL_THRESHOLD } from './AiChatTypes';

interface Props {
  open: boolean;
  usagePercent: number;
  totalMessages: number;
  historyLimit: number;
  onClose: () => void;
  onClearOld: (keepLast?: number) => void;
  onClearAll: () => void;
  onIncreaseLimit: (newLimit: number) => void;
}

/**
 * Модалка управления лимитом истории: очистить старые, очистить всё,
 * увеличить лимит. Открывается при заполнении на 100% автоматически
 * или вручную по клику на индикатор.
 *
 * Логика и стили 1:1 вынесены из AiChat.tsx — не меняем поведение.
 */
export default function AiChatLimitModal({
  open,
  usagePercent,
  totalMessages,
  historyLimit,
  onClose,
  onClearOld,
  onClearAll,
  onIncreaseLimit,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            usagePercent >= 1 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
          }`}>
            <Icon name={usagePercent >= 1 ? 'AlertCircle' : 'AlertTriangle'} size={20} />
          </div>
          <div>
            <div className="font-display font-700 text-base">
              {usagePercent >= 1 ? 'Лимит истории исчерпан' : 'История почти заполнена'}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Сейчас: <b>{totalMessages.toLocaleString('ru')}</b> сообщений из {historyLimit.toLocaleString('ru')}
              ({Math.round(usagePercent * 100)}%)
            </div>
          </div>
        </div>

        <div className="my-3 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              usagePercent >= 1 ? 'bg-red-500' : usagePercent >= CRITICAL_THRESHOLD ? 'bg-amber-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${Math.min(usagePercent * 100, 100)}%` }}
          />
        </div>

        <p className="text-sm text-foreground/85 mb-4">
          Что хотите сделать?
        </p>

        <div className="space-y-2">
          <button
            onClick={() => onClearOld(1000)}
            className="w-full px-4 py-3 rounded-xl border border-border hover:border-brand-blue hover:bg-brand-blue/5 text-left transition flex items-start gap-3 group"
          >
            <Icon name="Scissors" size={18} className="text-brand-blue mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Очистить старые</div>
              <div className="text-xs text-muted-foreground">Оставить только последние 1000 сообщений</div>
            </div>
          </button>

          <button
            onClick={onClearAll}
            className="w-full px-4 py-3 rounded-xl border border-border hover:border-red-400 hover:bg-red-50 text-left transition flex items-start gap-3"
          >
            <Icon name="Trash2" size={18} className="text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm text-red-700">Очистить всё</div>
              <div className="text-xs text-muted-foreground">Полностью удалить историю диалога</div>
            </div>
          </button>

          <button
            onClick={() => onIncreaseLimit(historyLimit + 5000)}
            className="w-full px-4 py-3 rounded-xl border border-border hover:border-emerald-400 hover:bg-emerald-50 text-left transition flex items-start gap-3"
          >
            <Icon name="Plus" size={18} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm text-emerald-700">
                Увеличить лимит до {(historyLimit + 5000).toLocaleString('ru')}
              </div>
              <div className="text-xs text-muted-foreground">+5000 к текущему лимиту</div>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
