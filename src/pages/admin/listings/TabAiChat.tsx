import { RefObject } from 'react';
import Icon from '@/components/ui/icon';
import { AiMsg } from './internalCardTypes';

interface Props {
  messages: AiMsg[];
  loading: boolean;
  marketLoading: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
  lastAiText: string;
  applying: string | null;
  applyChange: (field: 'title' | 'description', value: string) => void;
  ask: (text: string) => void;
  input: string;
  setInput: (v: string) => void;
  send: () => void;
}

export default function TabAiChat({
  messages, loading, marketLoading, bottomRef, lastAiText, applying, applyChange, ask, input, setInput, send,
}: Props) {
  return (
    <div className="flex flex-col" style={{ minHeight: 460 }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 380 }}>
        {marketLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5 w-fit">
            <Icon name="Loader2" size={12} className="animate-spin" />
            Загружаю рыночные данные...
          </div>
        )}
        {messages.length === 0 && loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="Loader2" size={16} className="animate-spin text-brand-orange" />
            Виртуальный брокер анализирует объект...
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === 'user') return (
            <div key={i} className="flex justify-end">
              <div className="bg-brand-blue text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[75%]">{m.text}</div>
            </div>
          );
          return (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="Sparkles" size={14} className="text-brand-orange" />
              </div>
              <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[80%] whitespace-pre-wrap leading-relaxed">{m.text}</div>
            </div>
          );
        })}
        {loading && messages.length > 0 && (
          <div className="flex gap-2 items-center text-xs text-muted-foreground">
            <Icon name="Loader2" size={14} className="animate-spin" /> Виртуальный брокер печатает...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {lastAiText && (
        <div className="px-5 py-2 border-t border-border bg-amber-50/50">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium">Применить рекомендации Виртуального брокера:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const match = lastAiText.match(/название[:\s«"]+([^»"\n]{5,100})/i);
                if (match) applyChange('title', match[1].trim());
                else ask('Предложи конкретное новое название для этого объекта одной строкой, без пояснений.');
              }}
              disabled={!!applying}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {applying === 'title' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Pencil" size={12} />}
              Применить к названию
            </button>
            <button
              onClick={() => {
                const match = lastAiText.match(/описание[:\s«"]+([^»"]{20,})/i);
                if (match) applyChange('description', match[1].trim());
                else ask('Напиши новое описание для этого объекта (2-4 абзаца), без вводных слов.');
              }}
              disabled={!!applying}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {applying === 'description' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="FileText" size={12} />}
              Применить к описанию
            </button>
            <button
              onClick={() => ask('Предложи новое название и описание для этого объекта. Формат — сначала строка "Название: ..." затем "Описание: ..."')}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-orange hover:text-brand-orange transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Icon name="RefreshCw" size={12} /> Переписать всё
            </button>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-2 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Задать вопрос Виртуальному брокеру..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-brand-blue"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            <Icon name="Send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}