import Icon from '@/components/ui/icon';
import { AiAction } from '@/lib/adminApi';
import { QUICK_CMDS } from './AiChatTypes';

interface Props {
  input: string;
  setInput: (v: string) => void;
  action: AiAction;
  loading: boolean;
  onSend: () => void;
}

export default function AiChatInput({ input, setInput, action, loading, onSend }: Props) {
  return (
    <div className="p-3 border-t border-border bg-white">
      <div className="text-[10px] text-muted-foreground mb-1.5 px-1">
        Активный режим: <span className="font-semibold text-foreground">{QUICK_CMDS.find(q => q.action === action)?.label || action}</span>
      </div>
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Введите запрос..."
          rows={2}
          className="flex-1 px-3 py-2 border border-input rounded-xl text-sm resize-none focus:outline-none focus:border-brand-blue"
        />
        <button
          onClick={onSend}
          disabled={loading}
          className="btn-blue text-white px-4 rounded-xl disabled:opacity-50"
        >
          <Icon name="Send" size={18} />
        </button>
      </div>
    </div>
  );
}