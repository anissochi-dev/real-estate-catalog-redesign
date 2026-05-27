import { useRef, useState } from 'react';
import { AiAction } from '@/lib/adminApi';
import {
  Msg, Suggestion,
  loadHistory,
} from './AiChatTypes';
import AiChatHeader from './AiChatHeader';
import AiChatMainTab from './AiChatMainTab';
import AiChatLimitIndicator from './AiChatLimitIndicator';
import AiChatLimitModal from './AiChatLimitModal';
import { useAiChatHistory } from './useAiChatHistory';
import { useAiChatActions } from './useAiChatActions';
import { MemoryData } from './AiChatAdminOpsTab';

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
  initialAction = 'agent',
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
  const [showMemory, setShowMemory] = useState(false);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const opsScrollRef = useRef<HTMLDivElement>(null);

  // Заглушки для ops-режима (не используется, но нужен хуку)
  const [opsMessages, setOpsMessages] = useState<Msg[]>([]);
  const [opsInput, setOpsInput] = useState('');
  const [opsLoading, setOpsLoading] = useState(false);

  const {
    historyLimit,
    limitModalOpen,
    setLimitModalOpen,
    totalMessages,
    usagePercent,
    handleClearAll,
    handleClearOld,
    handleIncreaseLimit,
  } = useAiChatHistory(messages, setMessages, scrollRef);

  const {
    loadMemory,
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
  } = useAiChatActions({
    action, setAction,
    input, setInput,
    messages, setMessages,
    loading, setLoading,
    opsInput, setOpsInput,
    opsMessages, setOpsMessages,
    opsLoading, setOpsLoading,
    opsScrollRef,
    setShowMemory,
    setMemoryData,
    setMemoryLoading,
    contextData,
    currentText,
    onResult,
    onApply,
    handleClearAll,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      <button
        onClick={onClose}
        className="flex-1 bg-black/30 backdrop-blur-[1px]"
        aria-label="Закрыть"
      />
      <aside className="w-full sm:max-w-md md:max-w-lg lg:max-w-xl h-full bg-white shadow-2xl flex flex-col animate-slide-in-right">
        <AiChatHeader
          title={title}
          memoryLoading={memoryLoading}
          onClearHistory={clearHistory}
          onLoadMemory={loadMemory}
          onClose={onClose}
        />

        <AiChatLimitIndicator
          usagePercent={usagePercent}
          totalMessages={totalMessages}
          historyLimit={historyLimit}
          onOpen={() => setLimitModalOpen(true)}
        />

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
          showMemory={showMemory}
          memoryData={memoryData}
          onCloseMemory={() => setShowMemory(false)}
        />
      </aside>

      <AiChatLimitModal
        open={limitModalOpen}
        usagePercent={usagePercent}
        totalMessages={totalMessages}
        historyLimit={historyLimit}
        onClose={() => setLimitModalOpen(false)}
        onClearOld={handleClearOld}
        onClearAll={handleClearAll}
        onIncreaseLimit={handleIncreaseLimit}
      />
    </div>
  );
}
