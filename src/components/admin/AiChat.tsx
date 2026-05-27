import { useRef, useState } from 'react';
import { AiAction } from '@/lib/adminApi';
import {
  Msg, Suggestion,
  loadHistory,
} from './AiChatTypes';
import AiChatHeader from './AiChatHeader';
import AiChatMainTab from './AiChatMainTab';
import AiChatAdminOpsTab, { MemoryData } from './AiChatAdminOpsTab';
import AiChatLimitIndicator from './AiChatLimitIndicator';
import AiChatLimitModal from './AiChatLimitModal';
import { useAiChatHistory } from './useAiChatHistory';
import { useAiChatActions } from './useAiChatActions';

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

  const [showMemory, setShowMemory] = useState(false);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const opsScrollRef = useRef<HTMLDivElement>(null);

  // Хук истории: лимит, предупреждения, очистка, увеличение лимита.
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

  // Хук действий: отправка, agent-actions, suggestions, режим Администрирование, память.
  const {
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
          chatTab={chatTab}
          setChatTab={setChatTab}
          title={title}
          memoryLoading={memoryLoading}
          onClearHistory={clearHistory}
          onLoadMemory={loadMemory}
          onClose={onClose}
        />

        {/* Индикатор лимита истории — показываем только при ≥80% */}
        <AiChatLimitIndicator
          usagePercent={usagePercent}
          totalMessages={totalMessages}
          historyLimit={historyLimit}
          onOpen={() => setLimitModalOpen(true)}
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
            showMemory={showMemory}
            memoryData={memoryData}
            onSendOps={sendOps}
            onCloseMemory={() => setShowMemory(false)}
          />
        )}
      </aside>

      {/* Модалка лимита истории */}
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