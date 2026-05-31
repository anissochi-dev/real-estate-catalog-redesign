import { useEffect } from 'react';
import { toast } from 'sonner';
import { aiApi, devopsApi, AiAction } from '@/lib/adminApi';
import {
  Msg, Suggestion, QuickCmd,
  isAutoApplicableAction,
  detectSuggestion,
} from './AiChatTypes';
import { MemoryData } from './AiChatAdminOpsTab';

interface UseAiChatActionsParams {
  // Основной режим
  action: AiAction;
  setAction: React.Dispatch<React.SetStateAction<AiAction>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  messages: Msg[];
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  // Режим Администрирование
  opsInput: string;
  setOpsInput: React.Dispatch<React.SetStateAction<string>>;
  opsMessages: Msg[];
  setOpsMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  opsLoading: boolean;
  setOpsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  opsScrollRef: React.RefObject<HTMLDivElement>;
  // База знаний (quick-look панель)
  setShowMemory: React.Dispatch<React.SetStateAction<boolean>>;
  setMemoryData: React.Dispatch<React.SetStateAction<MemoryData | null>>;
  setMemoryLoading: React.Dispatch<React.SetStateAction<boolean>>;
  // Внешние данные
  contextData?: unknown;
  currentText?: string;
  onResult?: (text: string) => void;
  onApply?: (text: string, kind: Suggestion['kind']) => void;
  // Очистка истории (из useAiChatHistory)
  handleClearAll: () => void;
}

/**
 * Хук со всеми логическими действиями чата: отправка сообщений,
 * подтверждение/отклонение agent-actions, suggestion-логика,
 * режим Администрирование с подтверждением «РАЗРЕШАЮ», загрузка памяти.
 *
 * Логика 1:1 вынесена из AiChat.tsx — не меняем поведение.
 */
export function useAiChatActions({
  action,
  setAction,
  input,
  setInput,
  messages,
  setMessages,
  loading,
  setLoading,
  opsInput,
  setOpsInput,
  opsMessages,
  setOpsMessages,
  opsLoading,
  setOpsLoading,
  opsScrollRef,
  setShowMemory,
  setMemoryData,
  setMemoryLoading,
  contextData,
  currentText,
  onResult,
  onApply,
  handleClearAll,
}: UseAiChatActionsParams) {
  useEffect(() => {
    if (opsScrollRef.current) {
      opsScrollRef.current.scrollTop = opsScrollRef.current.scrollHeight;
    }
  }, [opsMessages, opsScrollRef]);

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

  // Отправка в режиме Администрирование — выполняем сразу без подтверждений
  const sendOps = async (text?: string, _skipConfirm = false) => {
    const msg = (text ?? opsInput).trim();
    if (!msg || opsLoading) return;
    setOpsMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }]);
    setOpsInput('');
    await _doOpsRequest(msg);
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
      setOpsMessages(m => [...m, { role: 'ai', text: r.text, ts: Date.now(), vbRole: r.role }]);
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
            .filter(({ a }) => (a.risk === 'low' && isAutoApplicableAction(a.type, a.params))
              // Для update_* — авто-применяем только если все поля из safe-списка,
              // даже если модель пометила high (безопасность пользователя выше)
              || isAutoApplicableAction(a.type, a.params))
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
          vbRole: r.role,
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

  const DEVOPS_ACTIONS = new Set([
    'devops_check_github', 'devops_get_commits', 'devops_get_issues',
    'devops_create_issue', 'devops_get_workflows', 'devops_analyze_errors',
    'devops_get_repo_stats',
  ]);

  const confirmAgentAction = async (msgIdx: number, actIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg?.agentActions) return;
    const target = msg.agentActions[actIdx];
    if (!target || target.status !== 'pending') return;
    setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
      ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'pending', resultMessage: 'Выполняется...' } : a) }
      : x));
    try {
      let r: { ok?: boolean; message?: string; error?: string };
      if (DEVOPS_ACTIONS.has(target.type)) {
        // DevOps-действия идут в отдельную функцию devops-agent
        const action = target.type.replace('devops_', '');
        const res = await devopsApi.call(action, target.params as Record<string, unknown>);
        r = { ok: !!res.ok, message: res.message as string, error: res.error as string };
      } else {
        const res = await aiApi.execute([{ type: target.type, title: target.title, description: target.description, risk: target.risk, params: target.params }]);
        r = res.results?.[0]?.result || {};
      }
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
    // Все быстрые команды всегда идут через агента
    setAction('agent');
    if (q.prompt) {
      send(q.prompt, 'agent');
    } else {
      setInput('');
    }
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return {
    loadMemory,
    sendOps,
    send,
    confirmAgentAction,
    rejectAgentAction,
    confirmAllAgentActions,
    applySuggestion,
    rejectSuggestion,
    requestEdit,
    clearHistory,
    runQuick,
    formatTime,
  };
}