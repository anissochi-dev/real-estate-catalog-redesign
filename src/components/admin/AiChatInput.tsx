import Icon from '@/components/ui/icon';
import { AiAction } from '@/lib/adminApi';

interface Props {
  input: string;
  setInput: (v: string) => void;
  action: AiAction;
  loading: boolean;
  onSend: () => void;
}

export default function AiChatInput({ input, setInput, action, loading, onSend }: Props) {
  const canSend = !loading && (action === 'agent' || input.trim().length > 0);
  return (
    <div className="p-3 border-t border-border bg-white">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Спросите что угодно или дайте задачу…"
          rows={2}
          disabled={loading}
          className="flex-1 px-3 py-2 border border-input rounded-xl text-sm resize-none focus:outline-none focus:border-brand-blue disabled:opacity-60"
        />
        <button
          onClick={() => { if (canSend) onSend(); }}
          disabled={!canSend}
          title="Отправить (Enter)"
          aria-label="Отправить"
          className="btn-blue text-white px-4 rounded-xl disabled:opacity-50 flex items-center justify-center"
        >
          {loading
            ? <Icon name="Loader2" size={18} className="animate-spin" />
            : <Icon name="Send" size={18} />}
        </button>
      </div>
    </div>
  );
}
