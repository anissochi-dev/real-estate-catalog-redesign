import Icon from '@/components/ui/icon';

interface Props {
  chatTab: 'main' | 'admin_ops';
  setChatTab: (tab: 'main' | 'admin_ops') => void;
  title?: string;
  memoryLoading: boolean;
  onClearHistory: () => void;
  onLoadMemory: () => void;
  onClose: () => void;
}

export default function AiChatHeader({
  chatTab,
  setChatTab,
  title,
  memoryLoading,
  onClearHistory,
  onLoadMemory,
  onClose,
}: Props) {
  return (
    <>
      {/* Шапка */}
      <header className={`px-5 py-4 border-b border-border flex items-center justify-between text-white ${chatTab === 'admin_ops' ? 'bg-gradient-to-r from-red-700 to-red-900' : 'bg-gradient-to-r from-brand-blue to-brand-blue-dark'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base shrink-0">
            {chatTab === 'admin_ops' ? '⚙️' : '🏠'}
          </div>
          <div className="min-w-0">
            <div className="font-display font-700 truncate">
              {chatTab === 'admin_ops' ? 'Мелания · Администрирование' : (title || 'Мелания')}
            </div>
            <div className="text-xs opacity-80">
              {chatTab === 'admin_ops' ? 'Серьёзные вопросы · только с разрешения' : 'Живу на этом сайте · самообучаюсь'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {chatTab === 'main' && (
            <button onClick={onClearHistory} title="Очистить историю" className="hover:bg-white/10 rounded-lg p-1.5">
              <Icon name="Trash2" size={18} />
            </button>
          )}
          {chatTab === 'admin_ops' && (
            <button
              onClick={onLoadMemory}
              disabled={memoryLoading}
              title="Память Мелании"
              className="hover:bg-white/10 rounded-lg p-1.5 flex items-center gap-1 text-xs"
            >
              {memoryLoading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Brain" size={16} />}
            </button>
          )}
          <button onClick={onClose} className="hover:bg-white/10 rounded-lg p-1.5">
            <Icon name="X" size={20} />
          </button>
        </div>
      </header>

      {/* Переключатель вкладок */}
      <div className="flex border-b border-border bg-muted/20 shrink-0">
        <button
          onClick={() => setChatTab('main')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${chatTab === 'main' ? 'text-brand-blue border-b-2 border-brand-blue bg-white' : 'text-muted-foreground hover:bg-muted/40'}`}
        >
          <Icon name="MessageCircle" size={14} />
          Ассистент
        </button>
        <button
          onClick={() => setChatTab('admin_ops')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${chatTab === 'admin_ops' ? 'text-red-700 border-b-2 border-red-700 bg-white' : 'text-muted-foreground hover:bg-muted/40'}`}
        >
          <Icon name="ShieldAlert" size={14} />
          Администрирование
        </button>
      </div>
    </>
  );
}
