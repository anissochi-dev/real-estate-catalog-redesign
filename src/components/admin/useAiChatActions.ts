import { useEffect } from 'react';
import { toast } from 'sonner';
import { aiApi, devopsApi, smartRunApi, AiAction } from '@/lib/adminApi';
import {
  Msg, Suggestion, QuickCmd,
  isAutoApplicableAction,
  detectSuggestion,
  RESULT_INJECT_ACTIONS,
} from './AiChatTypes';

// Строит текст для истории — включает ключевые id чтобы ИИ мог их использовать
function buildResultHistoryText(actionType: string, actionTitle: string, result: Record<string, unknown>): string {
  let text = `📊 Результат «${actionTitle || actionType}»:\n${result.message || ''}`;

  // Для inspector_full_audit добавляем id из items
  if (actionType === 'inspector_full_audit' && result.audit) {
    const audit = result.audit as Record<string, unknown>;
    const parts: string[] = [];

    const broken = audit.broken_data as { count?: number; items?: { id: number }[] } | undefined;
    if (broken?.items?.length) {
      parts.push(`broken_data ids: [${broken.items.map(x => x.id).join(',')}]`);
    }
    const dupes = audit.duplicates as { count?: number; items?: { id?: number }[] } | undefined;
    if (dupes?.items?.length) {
      const dupeIds = dupes.items.map(x => x.id).filter(Boolean);
      if (dupeIds.length) parts.push(`duplicate ids: [${dupeIds.join(',')}]`);
    }
    const noPhoto = audit.no_photo as { count?: number; items?: { id: number }[] } | undefined;
    if (noPhoto?.items?.length) {
      parts.push(`no_photo ids: [${noPhoto.items.map(x => x.id).join(',')}]`);
    }
    const stale = audit.stale_listings as { count?: number; items?: { id: number }[] } | undefined;
    if (stale?.items?.length) {
      parts.push(`stale ids: [${stale.items.map(x => x.id).join(',')}]`);
    }
    const leads = audit.old_unprocessed_leads as { count?: number; items?: { id: number; name?: string }[] } | undefined;
    if (leads?.items?.length) {
      parts.push(`unprocessed_lead ids: [${leads.items.map(x => x.id).join(',')}] (первый: id=${leads.items[0].id}, ${leads.items[0].name || ''})`);
    }

    if (parts.length) {
      text += '\n\nКонкретные id для действий:\n' + parts.join('\n');
    }
  }

  // Для check_data_integrity — аналогично
  if (actionType === 'check_data_integrity' && result.issues) {
    const issues = result.issues as { id?: number }[];
    if (issues?.length) {
      text += `\nids с проблемами: [${issues.map((x) => x.id).filter(Boolean).join(',')}]`;
    }
  }

  // Для search_listings_with_broken_data — передаём ids
  if (actionType === 'search_listings_with_broken_data' && result.items) {
    const items = result.items as { id: number }[];
    if (items?.length) {
      text += `\nids объектов с битыми данными: [${items.map(x => x.id).join(',')}]\nИспользуй эти ids в fix_data_quality: {"issue_type":"wrong_price","ids":[...]} или {"issue_type":"missing_desc","ids":[...]}`;
    }
  }

  return text;
}
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
        setMessages(m => [...m, aiMsg]);

        // Авто-запуск безопасных действий — через ref к актуальному индексу
        const autoIdxs = incomingActions
          .map((a, i) => ({ a, i }))
          .filter(({ a }) => isAutoApplicableAction(a.type, a.params))
          .map(({ i }) => i);

        if (autoIdxs.length > 0) {
          // Запускаем после того как React обновит state
          setTimeout(() => {
            autoIdxs.reduce<Promise<void>>(
              (p, idx) => p.then(() => execActionByData(aiMsg, idx)),
              Promise.resolve(),
            );
          }, 100);
        }
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

  /** Выполняет действие напрямую по объекту action — без чтения из messages (нет stale closure). */
  const execActionByData = async (sourceMsg: Msg, actIdx: number) => {
    const target = sourceMsg.agentActions?.[actIdx];
    if (!target) return;
    // Обновляем статус в messages по timestamp совпадению
    setMessages(m => m.map(x =>
      x.ts === sourceMsg.ts && x.agentActions
        ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, resultMessage: 'Выполняется...' } : a) }
        : x
    ));
    try {
      let r: { ok?: boolean; message?: string; error?: string } & Record<string, unknown>;
      if (target.type === 'dispatcher_smart_run') {
        const res = await smartRunApi.run();
        r = { ok: res.ok, message: res.message };
      } else if (DEVOPS_ACTIONS.has(target.type)) {
        const res = await devopsApi.call(target.type.replace('devops_', ''), target.params as Record<string, unknown>);
        r = { ok: !!res.ok, message: res.message as string, error: res.error as string };
      } else {
        const res = await aiApi.execute([{ type: target.type, title: target.title, description: target.description, risk: target.risk, params: target.params }]);
        r = res.results?.[0]?.result || {};
      }
      const ok = !!r.ok;
      const resultData = RESULT_INJECT_ACTIONS.has(target.type) ? (r as Record<string, unknown>) : undefined;
      setMessages(m => {
        const next = m.map(x =>
          x.ts === sourceMsg.ts && x.agentActions
            ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx
                ? { ...a, status: ok ? 'applied' as const : 'failed' as const, resultMessage: r.message || r.error || '' , resultData }
                : a) }
            : x
        );
        if (ok && resultData) {
          return [...next, {
            role: 'ai' as const,
            text: buildResultHistoryText(target.type, target.title || target.type, resultData),
            action: 'agent' as const,
            ts: Date.now() + 1,
            agentActions: [],
          }];
        }
        return next;
      });
    } catch (e: unknown) {
      setMessages(m => m.map(x =>
        x.ts === sourceMsg.ts && x.agentActions
          ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'failed' as const, resultMessage: e instanceof Error ? e.message : 'Ошибка' } : a) }
          : x
      ));
    }
  };

  const confirmAgentAction = async (msgIdx: number, actIdx: number) => {
    // Читаем target из актуального state через ref-паттерн
    let target: NonNullable<Msg['agentActions']>[0] | undefined;
    setMessages(m => {
      target = m[msgIdx]?.agentActions?.[actIdx];
      return m; // не меняем state, только читаем
    });
    // Даём React обработать (нужен микротаск)
    await Promise.resolve();
    // Повторно читаем через snapshot если target не получен
    if (!target) {
      const snap = messages[msgIdx]?.agentActions?.[actIdx];
      target = snap;
    }
    if (!target || target.status !== 'pending') return;

    const t = target; // фиксируем для замыкания
    setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
      ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, resultMessage: 'Выполняется...' } : a) }
      : x));
    try {
      let r: { ok?: boolean; message?: string; error?: string } & Record<string, unknown>;
      if (t.type === 'dispatcher_smart_run') {
        const res = await smartRunApi.run();
        r = { ok: res.ok, message: res.message };
      } else if (DEVOPS_ACTIONS.has(t.type)) {
        const res = await devopsApi.call(t.type.replace('devops_', ''), t.params as Record<string, unknown>);
        r = { ok: !!res.ok, message: res.message as string, error: res.error as string };
      } else {
        const res = await aiApi.execute([{ type: t.type, title: t.title, description: t.description, risk: t.risk, params: t.params }]);
        r = res.results?.[0]?.result || {};
      }
      const ok = !!r.ok;
      const resultData = RESULT_INJECT_ACTIONS.has(t.type) ? (r as Record<string, unknown>) : undefined;
      setMessages(m => {
        const next = m.map((x, i) => i === msgIdx && x.agentActions
          ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx
              ? { ...a, status: ok ? 'applied' as const : 'failed' as const, resultMessage: r.message || r.error || '', resultData }
              : a) }
          : x);
        if (ok && resultData) {
          return [...next, {
            role: 'ai' as const,
            text: buildResultHistoryText(t.type, t.title || t.type, resultData),
            action: 'agent' as const,
            ts: Date.now() + 1,
            agentActions: [],
          }];
        }
        return next;
      });
    } catch (e: unknown) {
      setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
        ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'failed' as const, resultMessage: e instanceof Error ? e.message : 'Ошибка' } : a) }
        : x));
    }
  };

  const rejectAgentAction = (msgIdx: number, actIdx: number) => {
    setMessages(m => m.map((x, i) => i === msgIdx && x.agentActions
      ? { ...x, agentActions: x.agentActions.map((a, j) => j === actIdx ? { ...a, status: 'rejected' as const } : a) }
      : x));
  };

  const confirmAllAgentActions = async (msgIdx: number) => {
    // Читаем актуальный список действий из state
    let actions: NonNullable<Msg['agentActions']> = [];
    setMessages(m => { actions = m[msgIdx]?.agentActions || []; return m; });
    await Promise.resolve();
    if (!actions.length) actions = messages[msgIdx]?.agentActions || [];
    for (let i = 0; i < actions.length; i++) {
      if (actions[i].status === 'pending') {
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
    setAction('agent');
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