import { RefObject } from 'react';
import { AiAction } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Msg, QuickCmd, QUICK_CMDS } from './AiChatTypes';
import { MemoryData } from './AiChatAdminOpsTab';
import AiChatMessage from './AiChatMessage';
import AiChatInput from './AiChatInput';

interface Props {
  scrollRef: RefObject<HTMLDivElement>;
  messages: Msg[];
  loading: boolean;
  action: AiAction;
  input: string;
  setInput: (v: string) => void;
  onSend: (overrideText?: string, overrideAction?: AiAction) => void;
  onRunQuick: (q: QuickCmd) => void;
  onApplySuggestion: (idx: number) => void;
  onRejectSuggestion: (idx: number) => void;
  onRequestEdit: (idx: number) => void;
  onConfirmAgentAction: (msgIdx: number, actIdx: number) => void;
  onRejectAgentAction: (msgIdx: number, actIdx: number) => void;
  onConfirmAllAgentActions: (msgIdx: number) => void;
  formatTime: (ts: number) => string;
  showMemory: boolean;
  memoryData: MemoryData | null;
  onCloseMemory: () => void;
  /** Расширенный полноэкранный режим — двухколоночный layout. */
  wide?: boolean;
}

export default function AiChatMainTab({
  scrollRef,
  messages,
  loading,
  action,
  input,
  setInput,
  onSend,
  onRunQuick,
  onApplySuggestion,
  onRejectSuggestion,
  onRequestEdit,
  onConfirmAgentAction,
  onRejectAgentAction,
  onConfirmAllAgentActions,
  formatTime,
  showMemory,
  memoryData,
  onCloseMemory,
  wide = false,
}: Props) {


  const memoryPanel = showMemory && (
    <div className={`shrink-0 bg-white border border-brand-blue/20 rounded-xl overflow-hidden ${wide ? 'mx-0 mt-0 rounded-none border-0 border-b border-brand-blue/20' : 'mx-3 mt-2'}`}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-brand-blue/5 border-b border-brand-blue/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-blue">
          <Icon name="BookOpen" size={15} />
          База знаний ВБ — быстрый просмотр
        </div>
        <button onClick={onCloseMemory} className="text-muted-foreground hover:text-foreground">
          <Icon name="X" size={15} />
        </button>
      </div>
      {!memoryData ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">Не удалось загрузить базу знаний</div>
      ) : (
        <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
          <div className="text-xs text-muted-foreground">Взаимодействий: <strong>{memoryData.interaction_count}</strong></div>
          {memoryData.learned_facts.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1">Знания (последние)</div>
              {memoryData.learned_facts.slice(-8).map((f, i) => (
                <div key={i} className="text-xs bg-muted/40 rounded-lg px-3 py-1.5 mb-1">{f}</div>
              ))}
            </div>
          )}
          {memoryData.tech_decisions.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1">Решения</div>
              {memoryData.tech_decisions.slice(-5).map((d, i) => (
                <div key={i} className="text-xs border border-border rounded-lg px-3 py-2 mb-1">
                  <span className="text-muted-foreground">{d.date} · </span>{d.q.slice(0, 80)}
                </div>
              ))}
            </div>
          )}
          {!memoryData.learned_facts.length && !memoryData.tech_decisions.length && (
            <div className="text-xs text-muted-foreground">База знаний пока пуста — начни общаться или открой полный раздел вверху.</div>
          )}
        </div>
      )}
    </div>
  );

  const HINTS = [
    { text: 'Что сейчас срочного на сайте?', id: 'what_to_do' },
    { text: 'Покажи аналитику по лидам и объектам', id: 'analytics_full' },
    { text: 'Найди объекты без описания и улучши их', id: 'edit_site' },
    { text: 'Проверь безопасность и SEO', id: 'security' },
  ];

  const emptyState = (
    <div className="text-center text-muted-foreground text-sm py-8">
      <div className="text-4xl mx-auto mb-3">🏠</div>
      <div className="font-semibold mb-1 text-foreground">Привет! Я Виртуальный брокер.</div>
      <div className="text-xs text-muted-foreground mb-5">Знаю весь сайт — каталог, заявки, цены, SEO. Спрашивай что угодно или дай задачу.</div>
      <div className="space-y-1.5 text-xs text-left max-w-sm mx-auto">
        {HINTS.map((h, i) => {
          const cmd = QUICK_CMDS.find(q => q.id === h.id);
          return (
            <button
              key={h.id}
              onClick={() => cmd && onRunQuick(cmd)}
              className={`w-full px-3.5 py-2.5 rounded-xl text-left transition text-foreground/80 hover:text-foreground ${i === 0 ? 'bg-brand-blue/5 hover:bg-brand-blue/10 border border-brand-blue/20' : 'bg-muted/40 hover:bg-muted/70 border border-border'}`}
            >
              {h.text}
            </button>
          );
        })}
      </div>
    </div>
  );

  const messageList = (
    <>
      {messages.length === 0 && emptyState}
      {messages.map((m, i) => (
        <AiChatMessage
          key={i}
          msg={m}
          idx={i}
          formatTime={formatTime}
          onApplySuggestion={onApplySuggestion}
          onRejectSuggestion={onRejectSuggestion}
          onRequestEdit={onRequestEdit}
          onConfirmAgentAction={onConfirmAgentAction}
          onRejectAgentAction={onRejectAgentAction}
          onConfirmAllAgentActions={onConfirmAllAgentActions}
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
    </>
  );

  // ── Расширенный режим ──────────────────────────────────────────────────
  if (wide) {
    return (
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0">
          {memoryPanel}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
            {messageList}
          </div>
          <div className="max-w-4xl mx-auto w-full px-2 pb-2">
            <AiChatInput input={input} setInput={setInput} action={action} loading={loading} onSend={onSend} />
          </div>
        </div>
      </div>
    );
  }

  // ── Обычный режим ──────────────────────────────────────────────────────
  return (
    <>
      {memoryPanel}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messageList}
      </div>
      <AiChatInput input={input} setInput={setInput} action={action} loading={loading} onSend={onSend} />
    </>
  );
}