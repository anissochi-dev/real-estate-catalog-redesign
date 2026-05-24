/**
 * ChatbotWidget — плавающий чат-бот Виртуального брокера для посетителей сайта.
 * Отвечает на вопросы об объектах и услугах, НЕ раскрывает
 * конфиденциальную информацию компании и собственников.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

const CHATBOT_URL = 'https://functions.poehali.dev/f0ace57c-99c2-47b7-98f8-c60380842659';

interface Message {
  role: 'user' | 'bot';
  text: string;
  ts: number;
  logId?: number | null;
  feedback?: 1 | -1 | null;
}

const SESSION_KEY = 'biznest_chatbot_session';
function getSessionId(): string {
  try {
    let s = localStorage.getItem(SESSION_KEY);
    if (!s) {
      s = `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return `cs_${Date.now().toString(36)}`;
  }
}

const WELCOME = 'Привет! Я Виртуальный брокер (ВБ) — ИИ-ассистент Бизнес. Маркетинг. Недвижимость. Помогу найти подходящий объект, отвечу на вопросы об аренде и покупке. Чем могу помочь?';

const QUICK_QUESTIONS = [
  'Какие объекты есть в аренду?',
  'Как оставить заявку на просмотр?',
  'Какой минимальный бюджет аренды?',
];

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: WELCOME, ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [available, setAvailable] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Проверяем доступность ИИ
    fetch(`${CHATBOT_URL}?action=status`)
      .then(r => r.json())
      .then(d => setAvailable(d.available !== false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }]);
    setInput('');
    setLoading(true);

    try {
      const r = await fetch(CHATBOT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, session_id: getSessionId() }),
      });
      const data = await r.json();
      const reply = data.reply || 'Не удалось получить ответ. Попробуйте позже.';
      const logId = typeof data.log_id === 'number' ? data.log_id : null;
      setMessages(m => [...m, { role: 'bot', text: reply, ts: Date.now(), logId, feedback: null }]);
      if (!open) setUnread(n => n + 1);
    } catch {
      setMessages(m => [...m, {
        role: 'bot',
        text: 'Произошла ошибка. Пожалуйста, оставьте заявку на сайте или позвоните нам.',
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (idx: number, value: 1 | -1) => {
    const msg = messages[idx];
    if (!msg || msg.role !== 'bot' || !msg.logId || msg.feedback) return;
    // Оптимистичное обновление
    setMessages(m => m.map((x, i) => i === idx ? { ...x, feedback: value } : x));
    try {
      await fetch(CHATBOT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'feedback', log_id: msg.logId, value }),
      });
    } catch {
      // Тихо игнорируем — фидбэк не критичен
    }
  };

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (!available && messages.length <= 1) return null;

  return (
    <>
      {/* Кнопка открытия */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-brand-blue text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Открыть чат с Виртуальным брокером"
      >
        {open ? <Icon name="X" size={22} /> : <Icon name="MessageCircle" size={24} />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Окно чата */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[340px] sm:w-[380px] bg-white rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-fade-in"
          style={{ maxHeight: 'calc(100vh - 120px)' }}>

          {/* Шапка */}
          <div className="bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-base shrink-0">🏠</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Виртуальный брокер</div>
              <div className="text-[11px] opacity-80">ИИ-ассистент BIZNEST · онлайн</div>
            </div>
            <button onClick={() => setOpen(false)} className="hover:bg-white/10 rounded-lg p-1">
              <Icon name="X" size={18} />
            </button>
          </div>

          {/* Сообщения */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 200, maxHeight: 400 }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'bot' && (
                  <div className="w-6 h-6 bg-brand-blue/10 rounded-full flex items-center justify-center text-xs shrink-0 mt-1 mr-2">🏠</div>
                )}
                <div className="max-w-[80%] flex flex-col items-start gap-1">
                  <div className={`px-3 py-2.5 rounded-2xl text-sm ${
                    m.role === 'user'
                      ? 'bg-brand-blue text-white rounded-br-sm self-end'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    <div className="leading-relaxed whitespace-pre-wrap">{m.text}</div>
                    <div className="text-[10px] opacity-50 mt-1 text-right">{fmt(m.ts)}</div>
                  </div>
                  {/* Фидбэк только для ответов бота (кроме приветствия) с logId */}
                  {m.role === 'bot' && m.logId && (
                    <div className="flex items-center gap-1 pl-1">
                      {m.feedback === null || m.feedback === undefined ? (
                        <>
                          <span className="text-[10px] text-muted-foreground">Полезно?</span>
                          <button
                            onClick={() => sendFeedback(i, 1)}
                            className="p-1 rounded-md hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition"
                            aria-label="Полезно"
                            title="Полезно"
                          >
                            <Icon name="ThumbsUp" size={12} />
                          </button>
                          <button
                            onClick={() => sendFeedback(i, -1)}
                            className="p-1 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition"
                            aria-label="Не полезно"
                            title="Не полезно"
                          >
                            <Icon name="ThumbsDown" size={12} />
                          </button>
                        </>
                      ) : (
                        <span className={`text-[10px] inline-flex items-center gap-1 ${
                          m.feedback === 1 ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          <Icon name={m.feedback === 1 ? 'ThumbsUp' : 'ThumbsDown'} size={11} />
                          {m.feedback === 1 ? 'Спасибо!' : 'Учтём для улучшения'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 bg-brand-blue/10 rounded-full flex items-center justify-center text-xs shrink-0">🏠</div>
                <div className="bg-muted px-4 py-3 rounded-2xl flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce [animation-delay:0.15s]" />
                  <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            )}
          </div>

          {/* Быстрые вопросы — показываем только в начале */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 bg-brand-blue/8 text-brand-blue rounded-full border border-brand-blue/20 hover:bg-brand-blue/15 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Инпут */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Задайте вопрос..."
                disabled={loading}
                maxLength={500}
                className="flex-1 px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:border-brand-blue disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="p-2.5 bg-brand-blue text-white rounded-xl hover:opacity-90 disabled:opacity-40 transition"
              >
                <Icon name="Send" size={16} />
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Виртуальный брокер не раскрывает контакты собственников и конфиденциальные данные
            </div>
          </div>
        </div>
      )}
    </>
  );
}