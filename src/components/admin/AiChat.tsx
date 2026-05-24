import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { aiApi, AiAction } from '@/lib/adminApi';
import {
  Msg, Suggestion, QuickCmd,
  AUTO_APPLY_ACTIONS,
  WARNING_THRESHOLD, CRITICAL_THRESHOLD,
  detectSuggestion, loadHistory, saveHistory,
  getHistoryLimit, setHistoryLimit,
  clearHistory as clearStorageHistory,
  trimHistory,
} from './AiChatTypes';
import Icon from '@/components/ui/icon';
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

  // Контроль лимита истории
  const [historyLimit, setHistoryLimitState] = useState<number>(() => getHistoryLimit());
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const limitWarnedRef = useRef<'none' | 'warn' | 'critical'>('none');

  const totalMessages = messages.length;
  const usagePercent = historyLimit > 0 ? totalMessages / historyLimit : 0;

  useEffect(() => {
    saveHistory(messages);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Предупреждения по достижении порогов
    if (usagePercent >= 1 && limitWarnedRef.current !== 'critical') {
      limitWarnedRef.current = 'critical';
      setLimitModalOpen(true);
    } else if (usagePercent >= CRITICAL_THRESHOLD && limitWarnedRef.current === 'none') {
      limitWarnedRef.current = 'critical';
      toast.warning(`Лимит истории почти исчерпан: ${totalMessages} / ${historyLimit}`, {
        description: 'Скоро будет автоочистка. Очистите вручную или увеличьте лимит.',
        duration: 8000,
      });
    } else if (usagePercent >= WARNING_THRESHOLD && limitWarnedRef.current === 'none') {
      limitWarnedRef.current = 'warn';
      toast.info(`История заполнена на ${Math.round(usagePercent * 100)}%`, {
        description: `${totalMessages} из ${historyLimit} сообщений. Подумайте об очистке.`,
        duration: 6000,
      });
    }
  }, [messages, usagePercent, totalMessages, historyLimit]);

  const handleClearAll = () => {
    if (!confirm('Полностью очистить историю диалога с ВБ? Это действие нельзя отменить.')) return;
    clearStorageHistory();
    setMessages([]);
    limitWarnedRef.current = 'none';
    setLimitModalOpen(false);
    toast.success('История очищена');
  };

  const handleClearOld = (keepLast: number = 1000) => {
    const kept = trimHistory(keepLast);
    setMessages(kept);
    limitWarnedRef.current = 'none';
    setLimitModalOpen(false);
    toast.success(`Удалены старые сообщения, оставлены последние ${kept.length}`);
  };

  const handleIncreaseLimit = (newLimit: number) => {
    setHistoryLimit(newLimit);
    setHistoryLimitState(newLimit);
    limitWarnedRef.current = usagePercent >= 1 ? 'critical' : usagePercent >= WARNING_THRESHOLD ? 'warn' : 'none';
    setLimitModalOpen(false);
    toast.success(`Лимит увеличен до ${newLimit.toLocaleString('ru')} сообщений`);
  };

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
      // История диалога режима «Администрирование» — отдельная от обычного чата
      const opsHistory = opsMessages
        .slice(-15)
        .filter(m => (m.role === 'user' || m.role === 'ai') && (m.text || '').trim().length > 0)
        .map(m => ({ role: m.role as 'user' | 'ai', text: m.text }));
      const r = await aiApi.ask('admin_ops', msg, undefined, opsHistory);
      setOpsMessages(m => [...m, { role: 'ai', text: r.text, ts: Date.now() }]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'неизвестно';
      setOpsMessages(m => [...m, {
        role: 'ai',
        text: 'Не удалось получить ответ: ' + errMsg,
        ts: Date.now(),
      }]);
      toast.error('Не удалось получить ответ от ВБ', {
        description: errMsg.slice(0, 120),
      });
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
      // Собираем историю диалога — последние 15 сообщений, чтобы ВБ помнил контекст
      const history = messages
        .slice(-15)
        .filter(m => (m.role === 'user' || m.role === 'ai') && (m.text || '').trim().length > 0)
        .map(m => ({ role: m.role as 'user' | 'ai', text: m.text }));

      if (act === 'agent') {
        const r = await aiApi.agent(text || 'Что мне сейчас нужно сделать?', contextData, history);
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
        const r = await aiApi.ask(act, text, contextData, history);
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

  // clearHistory — обёртка для совместимости с AiChatHeader (он передаёт сюда onClearHistory)
  const clearHistory = handleClearAll;

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

        {/* Индикатор лимита истории — показываем только при ≥80% */}
        {usagePercent >= WARNING_THRESHOLD && (
          <button
            onClick={() => setLimitModalOpen(true)}
            className={`px-3 py-1.5 border-b text-xs flex items-center justify-between gap-2 transition hover:opacity-90 ${
              usagePercent >= 1
                ? 'bg-red-50 border-red-200 text-red-700'
                : usagePercent >= CRITICAL_THRESHOLD
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-800'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name={usagePercent >= 1 ? 'AlertCircle' : 'AlertTriangle'} size={12} />
              История: <b>{totalMessages.toLocaleString('ru')}</b> / {historyLimit.toLocaleString('ru')}
              ({Math.round(usagePercent * 100)}%)
            </span>
            <span className="font-semibold underline">Управлять</span>
          </button>
        )}

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

      {/* Модалка лимита истории */}
      {limitModalOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setLimitModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                usagePercent >= 1 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
              }`}>
                <Icon name={usagePercent >= 1 ? 'AlertCircle' : 'AlertTriangle'} size={20} />
              </div>
              <div>
                <div className="font-display font-700 text-base">
                  {usagePercent >= 1 ? 'Лимит истории исчерпан' : 'История почти заполнена'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Сейчас: <b>{totalMessages.toLocaleString('ru')}</b> сообщений из {historyLimit.toLocaleString('ru')}
                  ({Math.round(usagePercent * 100)}%)
                </div>
              </div>
            </div>

            <div className="my-3 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  usagePercent >= 1 ? 'bg-red-500' : usagePercent >= CRITICAL_THRESHOLD ? 'bg-amber-500' : 'bg-yellow-500'
                }`}
                style={{ width: `${Math.min(usagePercent * 100, 100)}%` }}
              />
            </div>

            <p className="text-sm text-foreground/85 mb-4">
              Что хотите сделать?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleClearOld(1000)}
                className="w-full px-4 py-3 rounded-xl border border-border hover:border-brand-blue hover:bg-brand-blue/5 text-left transition flex items-start gap-3 group"
              >
                <Icon name="Scissors" size={18} className="text-brand-blue mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Очистить старые</div>
                  <div className="text-xs text-muted-foreground">Оставить только последние 1000 сообщений</div>
                </div>
              </button>

              <button
                onClick={handleClearAll}
                className="w-full px-4 py-3 rounded-xl border border-border hover:border-red-400 hover:bg-red-50 text-left transition flex items-start gap-3"
              >
                <Icon name="Trash2" size={18} className="text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-red-700">Очистить всё</div>
                  <div className="text-xs text-muted-foreground">Полностью удалить историю диалога</div>
                </div>
              </button>

              <button
                onClick={() => handleIncreaseLimit(historyLimit + 5000)}
                className="w-full px-4 py-3 rounded-xl border border-border hover:border-emerald-400 hover:bg-emerald-50 text-left transition flex items-start gap-3"
              >
                <Icon name="Plus" size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-emerald-700">
                    Увеличить лимит до {(historyLimit + 5000).toLocaleString('ru')}
                  </div>
                  <div className="text-xs text-muted-foreground">+5000 к текущему лимиту</div>
                </div>
              </button>
            </div>

            <button
              onClick={() => setLimitModalOpen(false)}
              className="w-full mt-3 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}