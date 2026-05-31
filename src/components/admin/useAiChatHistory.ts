import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Msg,
  WARNING_THRESHOLD, CRITICAL_THRESHOLD,
  saveHistory,
  getHistoryLimit, setHistoryLimit,
  clearHistory as clearStorageHistory,
  trimHistory,
} from './AiChatTypes';

/**
 * Хук управления историей диалога: лимит сообщений, предупреждения,
 * очистка, увеличение лимита. Сохраняет историю в localStorage при изменении messages
 * и автоматически прокручивает scrollRef вниз.
 *
 * Логика 1:1 вынесена из AiChat.tsx — не меняем поведение.
 */
export function useAiChatHistory(
  messages: Msg[],
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>,
  scrollRef: React.RefObject<HTMLDivElement>,
) {
  const [historyLimit, setHistoryLimitState] = useState<number>(() => getHistoryLimit());
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const limitWarnedRef = useRef<'none' | 'warn' | 'critical'>('none');

  const totalMessages = messages.length;

  // Скролл при первом монтировании — useLayoutEffect гарантирует что DOM уже готов
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollRef]);
  const usagePercent = historyLimit > 0 ? totalMessages / historyLimit : 0;

  useEffect(() => {
    saveHistory(messages);
    // Скролл вниз: несколько попыток — на случай когда карточки действий рендерятся асинхронно
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    requestAnimationFrame(scrollToBottom);
    setTimeout(scrollToBottom, 80);
    setTimeout(scrollToBottom, 300);
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
  }, [messages, usagePercent, totalMessages, historyLimit, scrollRef]);

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

  return {
    historyLimit,
    limitModalOpen,
    setLimitModalOpen,
    totalMessages,
    usagePercent,
    handleClearAll,
    handleClearOld,
    handleIncreaseLimit,
  };
}