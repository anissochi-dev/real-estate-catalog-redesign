import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { AiAction } from '@/lib/adminApi';
import AiChatMessage from '@/components/admin/AiChatMessage';
import AiChatInput from '@/components/admin/AiChatInput';
import { Msg, QuickCmd, QUICK_CMDS, loadHistory } from '@/components/admin/AiChatTypes';
import { useAiChatHistory } from '@/components/admin/useAiChatHistory';
import { useAiChatActions } from '@/components/admin/useAiChatActions';
import { ADMIN_OPS_CMDS, MemoryData } from '@/components/admin/AiChatAdminOpsTab';
import AiChatLimitIndicator from '@/components/admin/AiChatLimitIndicator';
import AiChatLimitModal from '@/components/admin/AiChatLimitModal';

type Tab = 'chat' | 'admin' | 'analysis';

const ANALYSIS_CMDS: { id: string; label: string; icon: string; action: AiAction; prompt: string }[] = [
  { id: 'full', label: 'Полный анализ', icon: 'ScanSearch', action: 'analytics_full', prompt: 'Проведи полный анализ сайта: объекты, лиды, конверсия, качество данных, SEO, безопасность. Дай структурированный отчёт с оценкой каждого раздела и конкретными шагами для улучшения.' },
  { id: 'agent', label: 'Что нужно сделать', icon: 'Bot', action: 'agent', prompt: 'Проанализируй текущее состояние каталога, лидов и настроек сайта. Предложи самые важные действия, которые нужно выполнить прямо сейчас. Расставь по приоритету.' },
  { id: 'db', label: 'Проверка данных', icon: 'Database', action: 'db_check', prompt: 'Найди все проблемы в данных сайта: дубли объявлений, пустые поля, некорректные значения, устаревшие статусы, объявления без описания или цены.' },
  { id: 'seo', label: 'SEO-аудит', icon: 'Search', action: 'analytics_full', prompt: 'Проведи SEO-аудит сайта: проверь мета-теги, seo_title, seo_description объявлений, ключевые слова, структуру URL. Укажи что мешает индексации и как это исправить.' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldCheck', action: 'security', prompt: 'Проверь данные сайта на XSS-уязвимости, SQL-инъекции, подозрительные паттерны в текстах объявлений и данных пользователей. Оцени уровень защищённости.' },
  { id: 'marketing', label: 'Маркетинг', icon: 'TrendingUp', action: 'marketing', prompt: 'Проведи маркетинговый анализ каталога: конверсия, ценообразование, позиционирование объектов, целевая аудитория. Дай конкретные рекомендации по улучшению продаж.' },
  { id: 'content', label: 'Контент', icon: 'FileText', action: 'agent', prompt: 'Оцени качество контента сайта: описания объектов, заголовки, фотографии, SEO-тексты. Найди пробелы и предложи конкретные улучшения для каждого типа контента.' },
  { id: 'modernize', label: 'UX и конверсия', icon: 'Zap', action: 'modernize', prompt: 'Проанализируй сайт с точки зрения UX и конверсии. Предложи конкретный план улучшений: что мешает посетителям оставлять заявки, что можно оптимизировать.' },
];

const MAIN_QUICK = QUICK_CMDS.filter(q => ['agent', 'analytics_full', 'improve_listings', 'help', 'reply', 'desc'].includes(q.id));

export default function AIAssistantAdmin() {
  const [tab, setTab] = useState<Tab>('chat');

  // ── Основной чат ────────────────────────────────────────────────────────────
  const [action, setAction] = useState<AiAction>('admin');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory());
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Вкладка Администрирование ───────────────────────────────────────────────
  const [opsMessages, setOpsMessages] = useState<Msg[]>([]);
  const [opsInput, setOpsInput] = useState('');
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsPendingText, setOpsPendingText] = useState<string | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const opsScrollRef = useRef<HTMLDivElement>(null);

  // ── Вкладка Анализ ──────────────────────────────────────────────────────────
  const [analysisMessages, setAnalysisMessages] = useState<Msg[]>([]);
  const [analysisInput, setAnalysisInput] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisAction, setAnalysisAction] = useState<AiAction>('analytics_full');
  const analysisScrollRef = useRef<HTMLDivElement>(null);

  const {
    historyLimit, limitModalOpen, setLimitModalOpen,
    totalMessages, usagePercent,
    handleClearAll, handleClearOld, handleIncreaseLimit,
  } = useAiChatHistory(messages, setMessages, scrollRef);

  const {
    send, sendOps, runQuick, loadMemory, clearHistory,
    confirmAgentAction, rejectAgentAction, confirmAllAgentActions,
    applySuggestion, rejectSuggestion, requestEdit, formatTime,
  } = useAiChatActions({
    action, setAction,
    input, setInput,
    messages, setMessages,
    loading, setLoading,
    opsInput, setOpsInput,
    opsMessages, setOpsMessages,
    opsLoading, setOpsLoading,
    opsPendingText, setOpsPendingText,
    opsScrollRef,
    setShowMemory, setMemoryData, setMemoryLoading,
    handleClearAll,
  });

  // Анализ использует тот же механизм что и основной чат, но с отдельной историей
  const sendAnalysis = (overrideText?: string, overrideAction?: AiAction) => {
    const text = overrideText ?? analysisInput;
    const act = overrideAction ?? analysisAction;
    if (!text.trim() || analysisLoading) return;
    const userMsg: Msg = { role: 'user', text, ts: Date.now() };
    setAnalysisMessages(prev => [...prev, userMsg]);
    setAnalysisInput('');
    setAnalysisLoading(true);
    const history = analysisMessages.map(m => ({ role: m.role === 'ai' ? 'assistant' : m.role, text: m.text })) as { role: 'user' | 'assistant'; text: string }[];
    import('@/lib/adminApi').then(({ aiApi }) => {
      aiApi.ask(act, text, undefined, history).then(r => {
        const aiMsg: Msg = { role: 'ai', text: r.text || '', ts: Date.now(), action: act };
        setAnalysisMessages(prev => [...prev, aiMsg]);
        setTimeout(() => {
          analysisScrollRef.current?.scrollTo({ top: analysisScrollRef.current.scrollHeight, behavior: 'smooth' });
        }, 50);
      }).catch(() => {
        setAnalysisMessages(prev => [...prev, { role: 'ai', text: 'Ошибка при анализе. Попробуйте ещё раз.', ts: Date.now() }]);
      }).finally(() => setAnalysisLoading(false));
    });
  };

  const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
    { id: 'chat', label: 'ВБ — Ассистент', icon: 'MessageSquare', desc: 'Общение, задачи, помощь' },
    { id: 'analysis', label: 'Анализ сайта', icon: 'ScanSearch', desc: 'Аудит, данные, SEO' },
    { id: 'admin', label: 'Администрирование', icon: 'ShieldCheck', desc: 'Технические вопросы' },
  ];

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)', minHeight: 500 }}>
      {/* Шапка */}
      <div className="bg-white border-b border-border px-5 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <Icon name="Sparkles" size={22} className="text-brand-blue" />
              ИИ-ассистент Виртуальный брокер
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Понимает человеческий язык · Анализирует сайт · Предлагает решения</p>
          </div>
          <button
            onClick={loadMemory}
            disabled={memoryLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition disabled:opacity-60"
          >
            <Icon name={memoryLoading ? 'Loader2' : 'Brain'} size={15} className={memoryLoading ? 'animate-spin' : ''} />
            Память ВБ
          </button>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 mt-4 bg-muted/40 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? t.id === 'admin' ? 'bg-red-700 text-white shadow-sm' : 'bg-brand-blue text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
              }`}
            >
              <Icon name={t.icon} size={15} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Индикатор истории (только для чата) */}
      {tab === 'chat' && (
        <AiChatLimitIndicator
          usagePercent={usagePercent}
          totalMessages={totalMessages}
          historyLimit={historyLimit}
          onOpen={() => setLimitModalOpen(true)}
        />
      )}

      {/* ── ВБ-АССИСТЕНТ ────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Быстрые команды */}
          <div className="px-3 py-2 border-b border-border overflow-x-auto bg-muted/20 shrink-0">
            <div className="flex gap-2">
              {MAIN_QUICK.map(q => (
                <button
                  key={q.id}
                  onClick={() => runQuick(q)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition shrink-0 ${
                    action === q.action ? 'bg-brand-blue text-white' : 'bg-white hover:bg-muted border border-border'
                  }`}
                >
                  <Icon name={q.icon} size={13} />
                  {q.label}
                </button>
              ))}
              <button
                onClick={clearHistory}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition shrink-0 bg-white hover:bg-muted border border-border text-muted-foreground"
              >
                <Icon name="Trash2" size={13} />
                Очистить
              </button>
            </div>
          </div>

          {/* Память ВБ */}
          {showMemory && memoryData && (
            <div className="mx-4 mt-3 shrink-0 bg-white border border-brand-blue/20 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-brand-blue/5 border-b border-brand-blue/10">
                <div className="flex items-center gap-2 text-sm font-semibold text-brand-blue">
                  <Icon name="Brain" size={15} />
                  Память ВБ — {memoryData.interaction_count} взаимодействий
                </div>
                <button onClick={() => setShowMemory(false)} className="text-muted-foreground hover:text-foreground">
                  <Icon name="X" size={15} />
                </button>
              </div>
              <div className="px-4 py-3 space-y-3 max-h-48 overflow-y-auto">
                {memoryData.learned_facts.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1.5">Что я знаю о сайте</div>
                    <div className="space-y-1">
                      {memoryData.learned_facts.map((f, i) => (
                        <div key={i} className="text-xs bg-muted/40 rounded-lg px-3 py-1.5">{f}</div>
                      ))}
                    </div>
                  </div>
                )}
                {memoryData.tech_decisions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1.5">Решения</div>
                    {memoryData.tech_decisions.slice(0, 3).map((d, i) => (
                      <div key={i} className="text-xs border border-border rounded-lg px-3 py-2 mb-1">
                        <span className="text-muted-foreground">{d.date} · </span>
                        <span>{d.q.slice(0, 80)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!memoryData.learned_facts.length && !memoryData.tech_decisions.length && (
                  <div className="text-xs text-muted-foreground">Память пока пуста — начни общаться!</div>
                )}
              </div>
            </div>
          )}

          {/* Сообщения */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-10">
                <div className="text-5xl mb-4">🏠</div>
                <div className="font-semibold text-lg text-foreground mb-2">Привет! Я Виртуальный брокер (ВБ).</div>
                <div className="text-muted-foreground mb-5 max-w-sm mx-auto">
                  Живу на вашем сайте. Понимаю человеческий язык, анализирую данные и предлагаю конкретные решения.
                </div>
                <div className="grid gap-2 max-w-sm mx-auto text-left">
                  {[
                    '«Что нужно сделать на сайте прямо сейчас?»',
                    '«Напиши описания для объектов без текста»',
                    '«Как увеличить количество заявок?»',
                    '«Что не так с SEO на сайте?»',
                  ].map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(ex.replace(/«|»/g, '')); }}
                      className="px-3 py-2.5 bg-muted/50 hover:bg-muted rounded-xl text-xs text-left transition"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <AiChatMessage
                key={i} msg={m} idx={i} formatTime={formatTime}
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

          <AiChatInput input={input} setInput={setInput} action={action} loading={loading} onSend={send} />
        </div>
      )}

      {/* ── АНАЛИЗ САЙТА ────────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Кнопки анализа */}
          <div className="px-3 py-3 border-b border-border bg-muted/20 shrink-0">
            <div className="text-xs text-muted-foreground mb-2 px-1">Выберите тип анализа или задайте вопрос в свободной форме:</div>
            <div className="flex flex-wrap gap-2">
              {ANALYSIS_CMDS.map(cmd => (
                <button
                  key={cmd.id}
                  onClick={() => { setAnalysisAction(cmd.action); sendAnalysis(cmd.prompt, cmd.action); }}
                  disabled={analysisLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition bg-white hover:bg-brand-blue hover:text-white border border-border disabled:opacity-50"
                >
                  <Icon name={cmd.icon} size={13} />
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>

          {/* Сообщения анализа */}
          <div ref={analysisScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {analysisMessages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-12">
                <div className="text-5xl mb-4">🔍</div>
                <div className="font-semibold text-lg text-foreground mb-2">Анализ сайта</div>
                <div className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  ИИ анализирует ваш сайт напрямую из базы знаний: объявления, лиды, SEO, безопасность, контент.
                </div>
                <div className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
                  {ANALYSIS_CMDS.slice(0, 4).map(cmd => (
                    <button
                      key={cmd.id}
                      onClick={() => { setAnalysisAction(cmd.action); sendAnalysis(cmd.prompt, cmd.action); }}
                      className="flex items-start gap-3 px-4 py-3 bg-white border border-border rounded-xl hover:border-brand-blue hover:bg-brand-blue/5 transition text-left"
                    >
                      <Icon name={cmd.icon} size={18} className="text-brand-blue mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-sm text-foreground">{cmd.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cmd.prompt.slice(0, 60)}…</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {analysisMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0 mr-2 mt-1">
                    <Icon name="Bot" size={14} className="text-brand-blue" />
                  </div>
                )}
                <div className={`max-w-[88%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-brand-blue text-white rounded-br-sm'
                    : 'bg-white border border-border rounded-bl-sm shadow-sm'
                }`}>
                  {m.text}
                  <div className="text-[10px] opacity-50 mt-1.5 text-right">
                    {new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {analysisLoading && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
                  <Icon name="Bot" size={14} className="text-brand-blue" />
                </div>
                <div className="bg-white border border-border px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2 text-sm text-muted-foreground shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse [animation-delay:0.4s]" />
                  <span className="text-xs ml-1">Анализирую…</span>
                </div>
              </div>
            )}
          </div>

          {/* Инпут анализа */}
          <div className="p-3 border-t border-border bg-white shrink-0">
            <div className="flex gap-2">
              <input
                value={analysisInput}
                onChange={e => setAnalysisInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendAnalysis())}
                placeholder="Задайте вопрос об анализе сайта..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-muted/30"
                disabled={analysisLoading}
              />
              <button
                onClick={() => sendAnalysis()}
                disabled={!analysisInput.trim() || analysisLoading}
                className="px-4 py-2.5 rounded-xl bg-brand-blue text-white text-sm font-semibold disabled:opacity-50 transition hover:bg-brand-blue/90"
              >
                <Icon name={analysisLoading ? 'Loader2' : 'Send'} size={16} className={analysisLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── АДМИНИСТРИРОВАНИЕ ───────────────────────────────────────────────── */}
      {tab === 'admin' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Быстрые команды */}
          <div className="px-3 py-2 border-b border-border overflow-x-auto bg-red-50 shrink-0">
            <div className="flex gap-2">
              {ADMIN_OPS_CMDS.map(cmd => (
                <button
                  key={cmd.id}
                  onClick={() => { setOpsInput(''); sendOps(cmd.prompt, true); }}
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
          <div className="mx-4 mt-3 shrink-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs text-amber-800">
            <Icon name="ShieldAlert" size={14} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>Режим администрирования.</strong> Консультации — сразу. Изменения в системе — только после вашего «РАЗРЕШАЮ».
            </div>
          </div>

          {/* Панель памяти */}
          {showMemory && memoryData && (
            <div className="mx-4 mt-2 shrink-0 bg-white border border-red-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 border-b border-red-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                  <Icon name="Brain" size={15} />
                  Память Виртуального брокера
                </div>
                <button onClick={() => setShowMemory(false)} className="text-red-400 hover:text-red-700">
                  <Icon name="X" size={15} />
                </button>
              </div>
              <div className="px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
                <div className="text-xs text-muted-foreground">Взаимодействий: <strong>{memoryData.interaction_count}</strong></div>
                {memoryData.learned_facts.map((f, i) => (
                  <div key={i} className="text-xs bg-muted/40 rounded-lg px-3 py-1.5">{f}</div>
                ))}
                {!memoryData.learned_facts.length && (
                  <div className="text-xs text-muted-foreground">Память пуста</div>
                )}
              </div>
            </div>
          )}

          {/* Сообщения */}
          <div ref={opsScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {opsMessages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-10">
                <div className="text-5xl mb-4">⚙️</div>
                <div className="font-semibold text-lg text-foreground mb-2">Режим администрирования</div>
                <div className="text-muted-foreground mb-5 max-w-sm mx-auto">
                  Здесь я помогаю решать технические вопросы: домены, базы данных, интеграции, новые функции.
                </div>
                <div className="grid gap-2 max-w-sm mx-auto text-left">
                  {[
                    '«Как подключить собственный домен к сайту?»',
                    '«Как настроить уведомления о новых заявках?»',
                    '«Что делать если сайт работает медленно?»',
                    '«Как настроить интеграцию с Яндекс.Метрикой?»',
                  ].map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => { setOpsInput(ex.replace(/«|»/g, '')); }}
                      className="px-3 py-2.5 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl text-xs text-left transition"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {opsMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
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
                Введите <strong className="mx-1">РАЗРЕШАЮ</strong> для подтверждения или другой текст для отмены
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={opsInput}
                onChange={e => setOpsInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendOps())}
                placeholder={opsPendingText ? 'Введите РАЗРЕШАЮ или отмените...' : 'Задайте технический вопрос...'}
                className="flex-1 px-4 py-2.5 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300/30 bg-red-50/30"
                disabled={opsLoading}
              />
              <button
                onClick={() => sendOps()}
                disabled={!opsInput.trim() || opsLoading}
                className="px-4 py-2.5 rounded-xl bg-red-700 text-white text-sm font-semibold disabled:opacity-50 transition hover:bg-red-800"
              >
                <Icon name={opsLoading ? 'Loader2' : 'Send'} size={16} className={opsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      )}

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