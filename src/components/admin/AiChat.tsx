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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveHistory(messages);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        <header className="px-5 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="Sparkles" size={20} />
            <div className="min-w-0">
              <div className="font-display font-700 truncate">{title || 'ИИ-ассистент'}</div>
              <div className="text-xs opacity-80">YandexGPT · BIZNEST</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearHistory}
              title="Очистить историю"
              className="hover:bg-white/10 rounded-lg p-1.5"
            >
              <Icon name="Trash2" size={18} />
            </button>
            <button onClick={onClose} className="hover:bg-white/10 rounded-lg p-1.5">
              <Icon name="X" size={20} />
            </button>
          </div>
        </header>

        <div className="px-3 py-2 border-b border-border overflow-x-auto bg-muted/30">
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
              <Icon name="Bot" size={40} className="mx-auto mb-3 opacity-50" />
              <div className="font-semibold mb-2">Привет! Я твой ИИ-ассистент.</div>
              <div className="text-xs space-y-1">
                <div>Нажми <span className="font-semibold text-brand-blue">«Агент»</span> — и я сам предложу действия, которые надо выполнить.</div>
                <div>Каждое решение ты подтверждаешь вручную.</div>
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

        <AiChatInput
          input={input}
          setInput={setInput}
          action={action}
          loading={loading}
          onSend={send}
        />
      </aside>
    </div>
  );
}
