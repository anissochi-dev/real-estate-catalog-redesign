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
  // В режиме «Агент» можно отправлять пустой запрос — ВБ сам предложит действия.
  // В остальных режимах нужен непустой текст.
  const canSend = !loading && (action === 'agent' || input.trim().length > 0);
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
              if (canSend) onSend();
            }
          }}
          placeholder={action === 'agent' ? 'Опишите задачу или нажмите Отправить — ВБ сам предложит действия' : 'Введите запрос…'}
          rows={2}
          disabled={loading}
          className="flex-1 px-3 py-2 border border-input rounded-xl text-sm resize-none focus:outline-none focus:border-brand-blue disabled:opacity-60"
        />
        <button
          onClick={() => { if (canSend) onSend(); }}
          disabled={!canSend}
          title={!canSend && !loading ? 'Введите текст запроса' : 'Отправить'}
          aria-label="Отправить"
          className="btn-blue text-white px-4 rounded-xl disabled:opacity-50 flex items-center justify-center"
        >
          {loading
            ? <Icon name="Loader2" size={18} className="animate-spin" />
            : <Icon name="Send" size={18} />}
        </button>
      </div>
      {!canSend && !loading && action !== 'agent' && (
        <div className="text-[10px] text-muted-foreground mt-1 px-1">
          Введите текст запроса, чтобы отправить
        </div>
      )}
    </div>
  );
}