import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { aiApi, AiAction } from '@/lib/adminApi';
import {
  Msg, Suggestion, QuickCmd,
  HISTORY_KEY, AUTO_APPLY_ACTIONS,
  detectSuggestion, loadHistory, saveHistory,
} from './AiChatTypes';
import AiChatHeader from './AiChatHeader';
import AiChatMainTab from './AiChatMainTab';
import AiChatAdminOpsTab, { MemoryData } from './AiChatAdminOpsTab';

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
  const [showMemory, setShowMemory] = useState(false);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
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

  const loadMemory = async () => {
    setMemoryLoading(true);
    try {
      const data = await aiApi.getMemory();
      setMemoryData(data);
      setShowMemory(true);
    } catch {
      setShowMemory(true);
      setMemoryData(null);
    } finally {
      setMemoryLoading(false);
    }
  };

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
        const incomingActions = (r.actions || []).map(a => ({ ...a, status: 'pending' as const }));
        const aiMsg: Msg = {
          role: 'ai',
          text: r.reasoning || 'Готов предложить действия.',
          action: act,
          ts: Date.now(),
          reasoning: r.reasoning,
          agentActions: incomingActions,
        };
        setMessages(m => {
          const next = [...m, aiMsg];
          // Автозапуск безопасных информационных действий (risk=low) — без подтверждения
          const newMsgIdx = next.length - 1;
          const autoIdxs = incomingActions
            .map((a, i) => ({ a, i }))
            .filter(({ a }) => a.risk === 'low' && AUTO_APPLY_ACTIONS.has(a.type))
            .map(({ i }) => i);
          if (autoIdxs.length > 0) {
            setTimeout(() => {
              autoIdxs.reduce<Promise<void>>(
                (p, i) => p.then(() => confirmAgentAction(newMsgIdx, i)),
                Promise.resolve(),
              );
            }, 50);
          }
          return next;
        });
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
      const errMsg = e instanceof Error ? e.message : 'неизвестно';
      setMessages(m => [
        ...m,
        { role: 'ai', text: 'Не удалось получить ответ: ' + errMsg, ts: Date.now() },
      ]);
      toast.error('Не удалось получить ответ от ВБ', {
        description: errMsg.slice(0, 120),
      });
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
        <AiChatHeader
          chatTab={chatTab}
          setChatTab={setChatTab}
          title={title}
          memoryLoading={memoryLoading}
          onClearHistory={clearHistory}
          onLoadMemory={loadMemory}
          onClose={onClose}
        />

        {chatTab === 'main' && (
          <AiChatMainTab
            scrollRef={scrollRef}
            messages={messages}
            loading={loading}
            action={action}
            input={input}
            setInput={setInput}
            onSend={send}
            onRunQuick={runQuick}
            onApplySuggestion={applySuggestion}
            onRejectSuggestion={rejectSuggestion}
            onRequestEdit={requestEdit}
            onConfirmAgentAction={confirmAgentAction}
            onRejectAgentAction={rejectAgentAction}
            onConfirmAllAgentActions={confirmAllAgentActions}
            formatTime={formatTime}
          />
        )}

        {chatTab === 'admin_ops' && (
          <AiChatAdminOpsTab
            opsScrollRef={opsScrollRef}
            opsMessages={opsMessages}
            opsLoading={opsLoading}
            opsInput={opsInput}
            setOpsInput={setOpsInput}
            opsPendingText={opsPendingText}
            showMemory={showMemory}
            memoryData={memoryData}
            onSendOps={sendOps}
            onCloseMemory={() => setShowMemory(false)}
          />
        )}
      </aside>
    </div>
  );
}