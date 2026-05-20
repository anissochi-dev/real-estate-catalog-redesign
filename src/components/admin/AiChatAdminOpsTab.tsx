import { RefObject } from 'react';
import Icon from '@/components/ui/icon';
import { Msg } from './AiChatTypes';

export const ADMIN_OPS_CMDS = [
  { id: 'domain', label: 'Домен', icon: 'Globe', prompt: 'Как подключить собственный домен к этому сайту? Какие записи DNS нужны?' },
  { id: 'db', label: 'База данных', icon: 'Database', prompt: 'Проконсультируй по обслуживанию базы данных: оптимизация, очистка, резервные копии.' },
  { id: 'migration', label: 'Миграция', icon: 'DatabaseBackup', prompt: 'Как безопасно перенести сайт и данные на другой проект или хостинг?' },
  { id: 'newfeature', label: 'Новая функция', icon: 'Puzzle', prompt: 'Помоги спланировать добавление новой функции на сайт. Опиши требования.' },
  { id: 'integration', label: 'Интеграция', icon: 'Link', prompt: 'Как подключить внешний сайт, API или базу данных?' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldCheck', prompt: 'Проведи аудит безопасности сайта: доступы, уязвимости, рекомендации.' },
  { id: 'perf', label: 'Производительность', icon: 'Zap', prompt: 'Как улучшить скорость и стабильность работы сайта?' },
  { id: 'backup', label: 'Бэкап', icon: 'HardDrive', prompt: 'Какие данные нужно регулярно бэкапить и как это делать правильно?' },
];

export interface MemoryData {
  persona: string;
  interaction_count: string;
  learned_facts: string[];
  tech_decisions: { date: string; q: string; a: string }[];
  mood: string;
}

interface Props {
  opsScrollRef: RefObject<HTMLDivElement>;
  opsMessages: Msg[];
  opsLoading: boolean;
  opsInput: string;
  setOpsInput: (v: string) => void;
  opsPendingText: string | null;
  showMemory: boolean;
  memoryData: MemoryData | null;
  onSendOps: (text?: string, skipConfirm?: boolean) => void;
  onCloseMemory: () => void;
}

export default function AiChatAdminOpsTab({
  opsScrollRef,
  opsMessages,
  opsLoading,
  opsInput,
  setOpsInput,
  opsPendingText,
  showMemory,
  memoryData,
  onSendOps,
  onCloseMemory,
}: Props) {
  return (
    <>
      {/* Быстрые команды */}
      <div className="px-3 py-2 border-b border-border overflow-x-auto bg-red-50 shrink-0">
        <div className="flex gap-2">
          {ADMIN_OPS_CMDS.map(cmd => (
            <button
              key={cmd.id}
              onClick={() => { setOpsInput(''); onSendOps(cmd.prompt, true); }}
              disabled={opsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition shrink-0 bg-white border border-red-200 hover:bg-red-50 text-red-800 disabled:opacity-50"
            >
              <Icon name={cmd.icon} size={13} />
              {cmd.label}
            </button>
          ))}
        </div>
      </div>

      {/* Предупреждение */}
      <div className="mx-3 mt-3 shrink-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs text-amber-800">
        <Icon name="ShieldAlert" size={14} className="shrink-0 mt-0.5 text-amber-600" />
        <div>
          <strong>Режим администрирования.</strong> Консультации — сразу. Изменения в системе — только после вашего «РАЗРЕШАЮ».
        </div>
      </div>

      {/* Панель памяти */}
      {showMemory && (
        <div className="mx-3 mt-2 shrink-0 bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <Icon name="Brain" size={15} />
              Память Мелании
            </div>
            <button onClick={onCloseMemory} className="text-red-400 hover:text-red-700">
              <Icon name="X" size={15} />
            </button>
          </div>
          {!memoryData ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">Не удалось загрузить память</div>
          ) : (
            <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
              <div className="text-xs text-muted-foreground">
                Взаимодействий: <strong>{memoryData.interaction_count}</strong> · Настроение: <strong>{memoryData.mood}</strong>
              </div>
              {memoryData.learned_facts.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5">Важные факты</div>
                  <div className="space-y-1">
                    {memoryData.learned_facts.map((f, i) => (
                      <div key={i} className="text-xs bg-muted/40 rounded-lg px-3 py-1.5">{f}</div>
                    ))}
                  </div>
                </div>
              )}
              {memoryData.tech_decisions.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5">Технические решения</div>
                  <div className="space-y-2">
                    {memoryData.tech_decisions.map((d, i) => (
                      <div key={i} className="text-xs border border-red-100 rounded-lg px-3 py-2">
                        <div className="text-muted-foreground mb-0.5">{d.date}</div>
                        <div className="font-medium text-foreground mb-1">❓ {d.q}</div>
                        <div className="text-muted-foreground">💡 {d.a.slice(0, 200)}{d.a.length > 200 ? '...' : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {memoryData.learned_facts.length === 0 && memoryData.tech_decisions.length === 0 && (
                <div className="text-xs text-muted-foreground">Память пока пуста — начни общаться!</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Сообщения */}
      <div ref={opsScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {opsMessages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            <div className="text-4xl mb-3">⚙️</div>
            <div className="font-semibold mb-1 text-foreground">Режим администрирования</div>
            <div className="text-xs text-muted-foreground mb-4">Здесь я помогаю решать серьёзные технические вопросы: домены, БД, интеграции, новые функции.</div>
            <div className="space-y-1.5 text-xs text-left max-w-xs mx-auto">
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">«Как подключить домен к сайту?»</div>
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">«Как добавить интеграцию с CRM?»</div>
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">«Как перенести сайт на другой хостинг?»</div>
            </div>
          </div>
        )}
        {opsMessages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-red-700 text-white rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            }`}>
              {m.text}
              <div className="text-[10px] opacity-50 mt-1 text-right">
                {new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {opsLoading && (
          <div className="flex justify-start">
            <div className="bg-muted px-4 py-3 rounded-2xl flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      {/* Инпут */}
      <div className="p-3 border-t border-border bg-white shrink-0">
        {opsPendingText && (
          <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
            <Icon name="AlertTriangle" size={13} />
            Введите <strong>РАЗРЕШАЮ</strong> для подтверждения или другой текст для отмены
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={opsInput}
            onChange={e => setOpsInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onSendOps())}
            placeholder={opsPendingText ? 'Введите РАЗРЕШАЮ или отмените...' : 'Задайте технический вопрос...'}
            disabled={opsLoading}
            className="flex-1 px-4 py-2.5 border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-500 disabled:opacity-50"
          />
          <button
            onClick={() => onSendOps()}
            disabled={opsLoading || !opsInput.trim()}
            className="px-4 py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold hover:bg-red-800 disabled:opacity-40 transition"
          >
            <Icon name="Send" size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
