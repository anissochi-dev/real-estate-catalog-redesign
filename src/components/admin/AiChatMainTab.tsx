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
  const quickBar = (
    <div className={`px-3 py-2 border-b border-border overflow-x-auto bg-muted/30 shrink-0 ${wide ? 'border-r' : ''}`}>
      <div className={`flex gap-2 ${wide ? 'flex-wrap' : ''}`}>
        {QUICK_CMDS.map(q => (
          <button
            key={q.id}
            onClick={() => onRunQuick(q)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition shrink-0 bg-white hover:bg-brand-blue hover:text-white border border-border"
          >
            <Icon name={q.icon} size={14} />
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );

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

  const emptyState = (
    <div className="text-center text-muted-foreground text-sm py-8">
      <div className="text-4xl mx-auto mb-3">🏠</div>
      <div className="font-semibold mb-1 text-foreground">Привет! Я Виртуальный брокер.</div>
      <div className="text-xs text-muted-foreground mb-4">Живу на этом сайте, знаю его как свой дом. Могу анализировать, редактировать и улучшать.</div>
      <div className="space-y-1.5 text-xs text-left max-w-xs mx-auto">
        <button onClick={() => onRunQuick(QUICK_CMDS[0])} className="w-full px-3 py-2 bg-brand-blue/5 hover:bg-brand-blue/10 border border-brand-blue/20 rounded-xl text-left transition">
          Что сейчас нужно сделать на сайте?
        </button>
        <button onClick={() => onRunQuick(QUICK_CMDS[1])} className="w-full px-3 py-2 bg-muted/50 hover:bg-muted rounded-xl text-left transition">
          Найди и улучши объекты без описания
        </button>
        <button onClick={() => onRunQuick(QUICK_CMDS[2])} className="w-full px-3 py-2 bg-muted/50 hover:bg-muted rounded-xl text-left transition">
          Полная аналитика сайта
        </button>
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

  // ── Расширенный режим: левая колонка — команды, правая — чат ──────────
  if (wide) {
    return (
      <div className="flex flex-1 min-h-0">
        {/* Левая панель: быстрые команды + база знаний */}
        <div className="w-72 xl:w-80 shrink-0 border-r border-border flex flex-col bg-muted/20 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Быстрые команды</div>
            <div className="flex flex-col gap-1.5">
              {QUICK_CMDS.map(q => (
                <button
                  key={q.id}
                  onClick={() => onRunQuick(q)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition bg-white hover:bg-brand-blue hover:text-white border border-border"
                >
                  <Icon name={q.icon} size={14} className="shrink-0" />
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
          {showMemory && (
            <div className="flex-1 overflow-y-auto">
              {memoryPanel}
            </div>
          )}
        </div>

        {/* Правая панель: история + ввод */}
        <div className="flex flex-col flex-1 min-w-0">
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
      {quickBar}
      {memoryPanel}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messageList}
      </div>
      <AiChatInput input={input} setInput={setInput} action={action} loading={loading} onSend={onSend} />
    </>
  );
}