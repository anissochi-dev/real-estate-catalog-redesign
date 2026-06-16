import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';

const CHAT_URL = 'https://functions.poehali.dev/bc4dcd3b-280a-49e6-bb86-0d4717947646';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  listingId: number;
  listingTitle: string;
  onClose: () => void;
}

const GREETING = 'Привет! Я Макс, консультант компании БМН. Готов ответить на любые вопросы по этому объекту — цена, условия, показ. Что вас интересует?';

export default function AIChatWidget({ listingId, listingTitle, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadCreated, setLeadCreated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          listing_id: listingId,
          message: text,
          messages: messages, // история без текущего
        }),
      });
      const d = await res.json();
      if (d.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'Произошла ошибка. Попробуйте чуть позже.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: d.reply }]);
        if (d.lead_created && !leadCreated) setLeadCreated(true);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Не удалось получить ответ. Проверьте соединение.' }]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    'Возможен торг?',
    'Когда можно посмотреть?',
    'Есть ли парковка?',
    'Как оформить сделку?',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      {/* Оверлей — только на мобильном */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto lg:hidden"
        onClick={onClose}
      />

      {/* Окно чата */}
      <div className="relative pointer-events-auto w-full max-w-sm flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ height: 'min(560px, calc(100vh - 100px))' }}>

        {/* Шапка */}
        <div className="flex items-center gap-3 px-4 py-3 bg-brand-blue flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon name="Bot" size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white text-sm leading-tight">Макс — консультант БМН</div>
            <div className="text-white/60 text-[11px] truncate">{listingTitle}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
          >
            <Icon name="X" size={16} className="text-white" />
          </button>
        </div>

        {/* Сообщения */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name="Bot" size={13} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-brand-blue text-white rounded-br-sm'
                    : 'bg-white text-foreground shadow-sm rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon name="Bot" size={13} className="text-white" />
              </div>
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-blue/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-blue/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-blue/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {leadCreated && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <Icon name="CheckCircle2" size={14} className="text-emerald-600 flex-shrink-0" />
              Заявка принята! Менеджер свяжется с вами в течение 15 минут.
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Быстрые вопросы — только если мало сообщений */}
        {messages.length <= 2 && !loading && (
          <div className="px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0 bg-gray-50 border-t border-border/30">
            {quickQuestions.map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }}
                className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-white border border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Поле ввода */}
        <div className="flex items-center gap-2 px-3 py-3 border-t border-border bg-white flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Напишите вопрос..."
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border outline-none focus:border-brand-blue transition-colors min-w-0"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-brand-blue text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-brand-blue/90 transition-colors"
          >
            <Icon name="Send" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
