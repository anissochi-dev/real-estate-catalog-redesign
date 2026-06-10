import { useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { AiAction } from '@/lib/adminApi';

const PLACEHOLDERS = [
  'Что сейчас важно сделать на сайте?',
  'Найди заявки без ответа…',
  'Сколько объектов без описания?',
  'Напиши SEO для всех офисов…',
  'Есть ли подозрительная активность?',
  'Покажи аналитику за последний месяц…',
  'Найди объект по адресу или цене…',
  'Улучши описание объекта #…',
];

interface Props {
  input: string;
  setInput: (v: string) => void;
  action: AiAction;
  loading: boolean;
  onSend: () => void;
}

export default function AiChatInput({ input, setInput, action, loading, onSend }: Props) {
  const placeholder = useMemo(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)], []);
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
          placeholder={placeholder}
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