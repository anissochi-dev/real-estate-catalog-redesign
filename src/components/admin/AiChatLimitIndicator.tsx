import Icon from '@/components/ui/icon';
import { WARNING_THRESHOLD, CRITICAL_THRESHOLD } from './AiChatTypes';

interface Props {
  usagePercent: number;
  totalMessages: number;
  historyLimit: number;
  onOpen: () => void;
}

/**
 * Индикатор лимита истории — показывается только при ≥80% заполнения.
 * Кликабельная плашка, открывающая модалку управления.
 *
 * Логика и стили 1:1 вынесены из AiChat.tsx — не меняем поведение.
 */
export default function AiChatLimitIndicator({
  usagePercent,
  totalMessages,
  historyLimit,
  onOpen,
}: Props) {
  if (usagePercent < WARNING_THRESHOLD) return null;
  return (
    <button
      onClick={onOpen}
      className={`px-3 py-1.5 border-b text-xs flex items-center justify-between gap-2 transition hover:opacity-90 ${
        usagePercent >= 1
          ? 'bg-red-50 border-red-200 text-red-700'
          : usagePercent >= CRITICAL_THRESHOLD
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon name={usagePercent >= 1 ? 'AlertCircle' : 'AlertTriangle'} size={12} />
        История: <b>{totalMessages.toLocaleString('ru')}</b> / {historyLimit.toLocaleString('ru')}
        ({Math.round(usagePercent * 100)}%)
      </span>
      <span className="font-semibold underline">Управлять</span>
    </button>
  );
}
