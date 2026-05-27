import Icon from '@/components/ui/icon';

interface Props {
  title?: string;
  memoryLoading: boolean;
  onClearHistory: () => void;
  onLoadMemory: () => void;
  onClose: () => void;
}

export default function AiChatHeader({
  title,
  memoryLoading,
  onClearHistory,
  onLoadMemory,
  onClose,
}: Props) {
  return (
    <header className="px-5 py-4 border-b border-border flex items-center justify-between text-white bg-gradient-to-r from-brand-blue to-brand-blue-dark shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base shrink-0">
          🏠
        </div>
        <div className="min-w-0">
          <div className="font-display font-700 truncate">{title || 'Виртуальный брокер'}</div>
          <div className="text-xs opacity-80">Живу на этом сайте · самообучаюсь</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onLoadMemory}
          disabled={memoryLoading}
          title="Память ВБ"
          className="hover:bg-white/10 rounded-lg p-1.5"
        >
          {memoryLoading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Brain" size={16} />}
        </button>
        <button onClick={onClearHistory} title="Очистить историю" className="hover:bg-white/10 rounded-lg p-1.5">
          <Icon name="Trash2" size={18} />
        </button>
        <button onClick={onClose} className="hover:bg-white/10 rounded-lg p-1.5">
          <Icon name="X" size={20} />
        </button>
      </div>
    </header>
  );
}