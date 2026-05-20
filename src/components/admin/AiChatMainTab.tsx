import { RefObject } from 'react';
import { AiAction } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Msg, QuickCmd, QUICK_CMDS } from './AiChatTypes';
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
}: Props) {
  return (
    <>
      {/* Быстрые команды */}
      <div className="px-3 py-2 border-b border-border overflow-x-auto bg-muted/30 shrink-0">
        <div className="flex gap-2">
          {QUICK_CMDS.map(q => (
            <button
              key={q.id}
              onClick={() => onRunQuick(q)}
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

      {/* Сообщения */}
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
      </div>

      <AiChatInput input={input} setInput={setInput} action={action} loading={loading} onSend={onSend} />
    </>
  );
}
