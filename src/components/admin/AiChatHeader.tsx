import Icon from '@/components/ui/icon';
import { VbRole } from '@/lib/adminApi';

interface Props {
  title?: string;
  memoryLoading: boolean;
  onClearHistory: () => void;
  onLoadMemory: () => void;
  /** Открыть полноценный раздел «База знаний ВБ». */
  onOpenKnowledge?: () => void;
  onClose: () => void;
  /** ВБ сейчас обрабатывает запрос. */
  isWorking?: boolean;
  /** Роль последнего ответа (или текущая, если работает). */
  currentRole?: VbRole;
  /** Полноэкранный режим. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

const ROLE_META: Record<VbRole, { label: string; short: string; icon: string; color: string }> = {
  broker: {
    label: 'Коммерческий брокер',
    short: 'Брокер',
    icon: 'Briefcase',
    color: 'bg-amber-400/30 border-amber-300/50 text-amber-50',
  },
  it: {
    label: 'ИТ-эксперт',
    short: 'ИТ-эксперт',
    icon: 'Code2',
    color: 'bg-sky-400/30 border-sky-300/50 text-sky-50',
  },
  mixed: {
    label: 'Универсальный режим',
    short: 'Универсал',
    icon: 'Sparkles',
    color: 'bg-white/20 border-white/30 text-white',
  },
};

export default function AiChatHeader({
  title,
  memoryLoading,
  onClearHistory,
  onLoadMemory,
  onOpenKnowledge,
  onClose,
  isWorking = false,
  currentRole,
  expanded = false,
  onToggleExpand,
}: Props) {
  const role = currentRole || 'mixed';
  const meta = ROLE_META[role];

  // Статус: зелёный пульс = работает, красный = простаивает (нет активного запроса)
  const statusColor = isWorking ? 'bg-emerald-400' : 'bg-red-500';
  const statusLabel = isWorking ? 'Обрабатывает запрос' : 'Простаивает';
  const statusPulse = isWorking ? 'animate-pulse' : '';

  return (
    <header className="px-5 py-3 border-b border-border text-white bg-gradient-to-r from-brand-blue to-brand-blue-dark shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base">
              🏠
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-brand-blue ${statusColor} ${statusPulse}`}
              title={statusLabel}
            />
          </div>
          <div className="min-w-0">
            <div className="font-display font-700 truncate text-sm">{title || 'Виртуальный брокер'}</div>
            <div className="text-[11px] opacity-80 flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusColor} ${statusPulse}`} />
              {statusLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onOpenKnowledge && (
            <button
              onClick={onOpenKnowledge}
              title="Открыть Базу знаний ВБ"
              className="hover:bg-white/10 rounded-lg p-1.5 inline-flex items-center gap-1"
            >
              <Icon name="BookOpen" size={16} />
              <span className="hidden md:inline text-xs font-600">База знаний</span>
            </button>
          )}
          <button
            onClick={onLoadMemory}
            disabled={memoryLoading}
            title="Быстрый просмотр базы знаний"
            className="hover:bg-white/10 rounded-lg p-1.5"
          >
            {memoryLoading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Brain" size={16} />}
          </button>
          <button onClick={onClearHistory} title="Очистить историю" className="hover:bg-white/10 rounded-lg p-1.5">
            <Icon name="Trash2" size={18} />
          </button>
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={expanded ? 'Свернуть панель' : 'Развернуть на всю страницу'}
              className="hover:bg-white/10 rounded-lg p-1.5"
            >
              <Icon name={expanded ? 'Minimize2' : 'Maximize2'} size={18} />
            </button>
          )}
          <button onClick={onClose} className="hover:bg-white/10 rounded-lg p-1.5">
            <Icon name="X" size={20} />
          </button>
        </div>
      </div>

      {/* Бейдж активной роли */}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-600 border ${meta.color}`}
          title={`Активная роль: ${meta.label}`}
        >
          <Icon name={meta.icon} size={12} />
          {meta.short}
        </span>
        {isWorking && (
          <span className="text-[11px] opacity-80 flex items-center gap-1">
            <Icon name="Loader2" size={11} className="animate-spin" />
            думаю…
          </span>
        )}
      </div>
    </header>
  );
}