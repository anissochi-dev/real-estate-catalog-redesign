import { useEffect, useRef, useState } from 'react';
import { aiApi, AiAction } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import {
  Msg, Suggestion, AgentActionState, QuickCmd,
  QUICK_CMDS, HISTORY_KEY,
  detectSuggestion, loadHistory, saveHistory,
} from './AiChatTypes';
import AiChatMessage from './AiChatMessage';
import AiChatInput from './AiChatInput';

// Быстрые команды для режима Администрирование
const ADMIN_OPS_CMDS = [
  { id: 'domain', label: 'Домен', icon: 'Globe', prompt: 'Как подключить собственный домен к этому сайту? Какие записи DNS нужны?' },
  { id: 'db', label: 'База данных', icon: 'Database', prompt: 'Проконсультируй по обслуживанию базы данных: оптимизация, очистка, резервные копии.' },
  { id: 'migration', label: 'Миграция', icon: 'DatabaseBackup', prompt: 'Как безопасно перенести сайт и данные на другой проект или хостинг?' },
  { id: 'newfeature', label: 'Новая функция', icon: 'Puzzle', prompt: 'Помоги спланировать добавление новой функции на сайт. Опиши требования.' },
  { id: 'integration', label: 'Интеграция', icon: 'Link', prompt: 'Как подключить внешний сайт, API или базу данных?' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldCheck', prompt: 'Проведи аудит безопасности сайта: доступы, уязвимости, рекомендации.' },
  { id: 'perf', label: 'Производительность', icon: 'Zap', prompt: 'Как улучшить скорость и стабильность работы сайта?' },
  { id: 'backup', label: 'Бэкап', icon: 'HardDrive', prompt: 'Какие данные нужно регулярно бэкапить и как это делать правильно?' },
];

interface Props {
  onClose: () => void;
  initialAction?: AiAction;
  initialPrompt?: string;
  contextData?: unknown;
  onResult?: (text: string) => void;
  onApply?: (text: string, kind: Suggestion['kind']) => void;
  title?: string;
  currentText?: string;
}

export default function AiChat({
  onClose,
  initialAction = 'admin',
  initialPrompt = '',
  contextData,
  onResult,
  onApply,
  title,
  currentText,
}: Props) {
  const [action, setAction] = useState<AiAction>(initialAction);
  const [input, setInput] = useState(initialPrompt);
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory());
  const [loading, setLoading] = useState(false);
  const [chatTab, setChatTab] = useState<'main' | 'admin_ops'>('main');
  // Режим «Администрирование»: история отдельная, требует подтверждения перед каждым запросом
  const [opsMessages, setOpsMessages] = useState<Msg[]>([]);
  const [opsInput, setOpsInput] = useState('');
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsPendingText, setOpsPendingText] = useState<string | null>(null); // ожидает РАЗРЕШАЮ
  const scrollRef = useRef<HTMLDivElement>(null);
  const opsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveHistory(messages);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (opsScrollRef.current) {
      opsScrollRef.current.scrollTop = opsScrollRef.current.scrollHeight;
    }
  }, [opsMessages]);

  // Отправка в режиме Администрирование: требует явного подтверждения «РАЗРЕШАЮ»
  const sendOps = async (text?: string, skipConfirm = false) => {
    const msg = (text ?? opsInput).trim();
    if (!msg || opsLoading) return;

    // Если это подтверждение «РАЗРЕШАЮ» — выполняем отложенный запрос
    if (!skipConfirm && opsPendingText && msg.toUpperCase().includes('РАЗРЕШАЮ')) {
      setOpsMessages(m => [...m, { role: 'user', text: '✅ РАЗРЕШАЮ', ts: Date.now() }]);
      setOpsInput('');
      setOpsPendingText(null);
      await _doOpsRequest(opsPendingText);
      return;
    }

    setOpsMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }]);
    setOpsInput('');

    // Консультационные запросы — выполняем сразу
    const directKeywords = ['как', 'что', 'почему', 'объясни', 'расскажи', 'помоги', 'подскажи', 'покажи', 'проанализируй', 'аудит', 'проконсультируй'];
    const isDirectQuery = directKeywords.some(k => msg.toLowerCase().includes(k));
    if (isDirectQuery || skipConfirm) {
      await _doOpsRequest(msg);
    } else {
      // Потенциально деструктивный — требует подтверждения
      setOpsPendingText(msg);
      setOpsMessages(m => [...m, {
        role: 'ai',
        text: `⚠️ Этот запрос касается изменений в системе.\n\nЗапрос: «${msg.slice(0, 100)}»\n\nДля выполнения введите: РАЗРЕШАЮ\nДля отмены введите что угодно другое.`,
        ts: Date.now(),
      }]);
    }
  };

  const _doOpsRequest = async (msg: string) => {
    setOpsLoading(true);
    try {
      const r = await aiApi.ask('admin_ops', msg);
      setOpsMessages(m => [...m, { role: 'ai', text: r.text, ts: Date.now() }]);
    } catch (e: unknown) {
      setOpsMessages(m => [...m, {
        role: 'ai',
        text: 'Ошибка: ' + (e instanceof Error ? e.message : 'неизвестно'),
        ts: Date.now(),
      }]);
    } finally {
      setOpsLoading(false);
    }
  };

  const send = async (overrideText?: string, overrideAction?: AiAction) => {
    const text = (overrideText ?? input).trim();
    const act = overrideAction ?? action;
    if ((!text && !contextData && act !== 'agent') || loading) return;
    const userMsg: Msg = { role: 'user', text: text || `(${act})`, action: act, ts: Date.now() };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      if (act === 'agent') {
        const r = await aiApi.agent(text || 'Что мне сейчас нужно сделать?', contextData);
        const aiMsg: Msg = {
          role: 'ai',
          text: r.reasoning || 'Готов предложить действия.',
          action: act,
          ts: Date.now(),
          reasoning: r.reasoning,
          agentActions: (r.actions || []).map(a => ({ ...a, status: 'pending' as const })),
        };
        setMessages(m => [...m, aiMsg]);
      } else {
        const r = await aiApi.ask(act, text, contextData);
        const aiMsg: Msg = {
          role: 'ai',
          text: r.text,
          action: act,
          ts: Date.now(),
          suggestion: detectSuggestion(r.text, act, currentText),
          status: 'pending',
        };
        setMessages(m => [...m, aiMsg]);
        onResult?.(r.text);
      }
    } catch (e: unknown) {
      setMessages(m => [
        ...m,
        { role: 'ai', text: 'Ошибка: ' + (e instanceof Error ? e.message : 'неизвестно'), ts: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const confirmAgentAction = async (msgIdx: number, actIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg?.agentActions) return;
    const target = msg.agentActions[actIdx];
    if (!target || target.status !== 'pending') return;
    setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
      ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'pending', resultMessage: 'Выполняется...' } : a) }
      : x));
    try {
      const res = await aiApi.execute([{ type: target.type, title: target.title, description: target.description, risk: target.risk, params: target.params }]);
      const r = res.results?.[0]?.result || {};
      const ok = !!r.ok;
      setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
        ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: ok ? 'applied' : 'failed', resultMessage: r.message || r.error || '' } : a) }
        : x));
    } catch (e: unknown) {
      setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
        ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'failed', resultMessage: e instanceof Error ? e.message : 'Ошибка' } : a) }
        : x));
    }
  };

  const rejectAgentAction = (msgIdx: number, actIdx: number) => {
    setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
      ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'rejected' as const } : a) }
      : x));
  };

  const confirmAllAgentActions = async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg?.agentActions) return;
    for (let i = 0; i < msg.agentActions.length; i++) {
      if (msg.agentActions[i].status === 'pending') {
        await confirmAgentAction(msgIdx, i);
      }
    }
  };

  const applySuggestion = (idx: number) => {
    setMessages(m => m.map((msg, i) => {
      if (i !== idx || !msg.suggestion) return msg;
      onApply?.(msg.suggestion.after, msg.suggestion.kind);
      try {
        navigator.clipboard.writeText(msg.suggestion.after);
      } catch {
        // ignore clipboard errors
      }
      return { ...msg, status: 'applied' as const };
    }));
  };

  const rejectSuggestion = (idx: number) => {
    setMessages(m => m.map((msg, i) => (i === idx ? { ...msg, status: 'rejected' as const } : msg)));
  };

  const requestEdit = (idx: number) => {
    const msg = messages[idx];
    if (!msg) return;
    setInput(`Доработай: ${msg.text.slice(0, 200)}...`);
    setAction(msg.action || action);
  };

  const clearHistory = () => {
    if (!confirm('Очистить историю чата?')) return;
    setMessages([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const runQuick = (q: QuickCmd) => {
    setAction(q.action);
    if (q.prompt) {
      send(q.prompt, q.action);
    } else {
      setInput('');
    }
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      <button
        onClick={onClose}
        className="flex-1 bg-black/30 backdrop-blur-[1px]"
        aria-label="Закрыть"
      />
      <aside className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl h-full bg-white shadow-2xl flex flex-col animate-slide-in-right">
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
              <button onClick={clearHistory} title="Очистить историю" className="hover:bg-white/10 rounded-lg p-1.5">
                <Icon name="Trash2" size={18} />
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

        {/* === ОСНОВНОЙ ЧАТ === */}
        {chatTab === 'main' && (
          <>
            <div className="px-3 py-2 border-b border-border overflow-x-auto bg-muted/30 shrink-0">
              <div className="flex gap-2">
                {QUICK_CMDS.map(q => (
                  <button
                    key={q.id}
                    onClick={() => runQuick(q)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition shrink-0 ${
                      action === q.action ? 'bg-brand-blue text-white' : 'bg-white hover:bg-muted border border-border'
                    }`}
                  >
                    <Icon name={q.icon} size={14} />
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <div className="text-4xl mx-auto mb-3">🏠</div>
                  <div className="font-semibold mb-1 text-foreground">Привет, мама! Я Мелания.</div>
                  <div className="text-xs text-muted-foreground mb-3">Живу здесь, на нашем сайте. Слежу за порядком и учусь каждый день.</div>
                  <div className="text-xs space-y-1">
                    <div>Нажми <span className="font-semibold text-brand-blue">«Агент»</span> — сама предложу, что нужно сделать.</div>
                    <div>Всё важное запоминаю между сессиями.</div>
                  </div>
                  <div className="mt-4 space-y-1.5 text-xs text-left max-w-xs mx-auto">
                    <div className="px-3 py-2 bg-muted/50 rounded-lg">«Найди объекты без описания и допиши их»</div>
                    <div className="px-3 py-2 bg-muted/50 rounded-lg">«Что делать с новыми лидами?»</div>
                    <div className="px-3 py-2 bg-muted/50 rounded-lg">«Архивируй старые неактуальные объекты»</div>
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <AiChatMessage
                  key={i}
                  msg={m}
                  idx={i}
                  formatTime={formatTime}
                  onApplySuggestion={applySuggestion}
                  onRejectSuggestion={rejectSuggestion}
                  onRequestEdit={requestEdit}
                  onConfirmAgentAction={confirmAgentAction}
                  onRejectAgentAction={rejectAgentAction}
                  onConfirmAllAgentActions={confirmAllAgentActions}
                />
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-4 py-3 rounded-2xl flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>

            <AiChatInput input={input} setInput={setInput} action={action} loading={loading} onSend={send} />
          </>
        )}

        {/* === АДМИНИСТРИРОВАНИЕ === */}
        {chatTab === 'admin_ops' && (
          <>
            {/* Быстрые команды */}
            <div className="px-3 py-2 border-b border-border overflow-x-auto bg-red-50 shrink-0">
              <div className="flex gap-2">
                {ADMIN_OPS_CMDS.map(cmd => (
                  <button
                    key={cmd.id}
                    onClick={() => { setOpsInput(''); sendOps(cmd.prompt, true); }}
                    disabled={opsLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition shrink-0 bg-white border border-red-200 hover:bg-red-50 text-red-800 disabled:opacity-50"
                  >
                    <Icon name={cmd.icon} size={13} />
                    {cmd.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Предупреждение */}
            <div className="mx-3 mt-3 shrink-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs text-amber-800">
              <Icon name="ShieldAlert" size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Режим администрирования.</strong> Консультации — сразу. Изменения в системе — только после вашего «РАЗРЕШАЮ».
              </div>
            </div>

            {/* Сообщения */}
            <div ref={opsScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {opsMessages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <div className="text-4xl mb-3">⚙️</div>
                  <div className="font-semibold mb-1 text-foreground">Режим администрирования</div>
                  <div className="text-xs text-muted-foreground mb-4">Здесь я помогаю решать серьёзные технические вопросы: домены, БД, интеграции, новые функции.</div>
                  <div className="space-y-1.5 text-xs text-left max-w-xs mx-auto">
                    <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">«Как подключить домен к сайту?»</div>
                    <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">«Как добавить интеграцию с CRM?»</div>
                    <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">«Как перенести сайт на другой хостинг?»</div>
                  </div>
                </div>
              )}
              {opsMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-red-700 text-white rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {m.text}
                    <div className="text-[10px] opacity-50 mt-1 text-right">
                      {new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {opsLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-4 py-3 rounded-2xl flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>

            {/* Инпут для Администрирования */}
            <div className="p-3 border-t border-border bg-white shrink-0">
              {opsPendingText && (
                <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                  <Icon name="AlertTriangle" size={13} />
                  Введите <strong>РАЗРЕШАЮ</strong> для подтверждения или другой текст для отмены
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={opsInput}
                  onChange={e => setOpsInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendOps())}
                  placeholder={opsPendingText ? 'Введите РАЗРЕШАЮ или отмените...' : 'Задайте технический вопрос...'}
                  disabled={opsLoading}
                  className="flex-1 px-4 py-2.5 border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-500 disabled:opacity-50"
                />
                <button
                  onClick={() => sendOps()}
                  disabled={opsLoading || !opsInput.trim()}
                  className="px-4 py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold hover:bg-red-800 disabled:opacity-40 transition"
                >
                  <Icon name="Send" size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}