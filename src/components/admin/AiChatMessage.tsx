import Icon from '@/components/ui/icon';
import { Msg, ACTION_LABELS, RISK_STYLES } from './AiChatTypes';

interface Props {
  msg: Msg;
  idx: number;
  formatTime: (ts: number) => string;
  onApplySuggestion: (idx: number) => void;
  onRejectSuggestion: (idx: number) => void;
  onRequestEdit: (idx: number) => void;
  onConfirmAgentAction: (msgIdx: number, actIdx: number) => void;
  onRejectAgentAction: (msgIdx: number, actIdx: number) => void;
  onConfirmAllAgentActions: (msgIdx: number) => void;
}

export default function AiChatMessage({
  msg: m, idx: i, formatTime,
  onApplySuggestion, onRejectSuggestion, onRequestEdit,
  onConfirmAgentAction, onRejectAgentAction, onConfirmAllAgentActions,
}: Props) {
  const roleBadge = m.role === 'ai' && m.vbRole ? (
    m.vbRole === 'broker' ? { label: 'Брокер', icon: 'Briefcase', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
    : m.vbRole === 'it' ? { label: 'ИТ-эксперт', icon: 'Code2', cls: 'bg-sky-100 text-sky-800 border-sky-200' }
    : { label: 'Универсал', icon: 'Sparkles', cls: 'bg-slate-100 text-slate-700 border-slate-200' }
  ) : null;

  return (
    <div className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
      {roleBadge && (
        <div className={`mb-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-600 border ${roleBadge.cls}`}>
          <Icon name={roleBadge.icon} size={10} />
          {roleBadge.label}
        </div>
      )}
      <div
        className={`max-w-[90%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          m.role === 'user'
            ? 'bg-brand-blue text-white rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        {m.text}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 px-1">{formatTime(m.ts)}</div>

      {m.role === 'ai' && m.suggestion && m.status === 'pending' && (
        <div className="mt-2 w-full max-w-[90%] border border-border rounded-xl p-3 bg-white">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Icon name="Wand2" size={12} />
            Предложенная правка
          </div>
          {m.suggestion.before && (
            <div className="mb-2">
              <div className="text-[10px] text-muted-foreground mb-1">Было:</div>
              <div className="text-xs bg-red-50 text-red-900 p-2 rounded line-through opacity-70 max-h-24 overflow-y-auto">
                {m.suggestion.before}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Станет:</div>
            <div className="text-xs bg-emerald-50 text-emerald-900 p-2 rounded max-h-32 overflow-y-auto">
              {m.suggestion.after}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onApplySuggestion(i)}
              className="flex-1 btn-blue text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1"
            >
              <Icon name="Check" size={12} />
              Применить
            </button>
            <button
              onClick={() => onRequestEdit(i)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted inline-flex items-center gap-1"
            >
              <Icon name="Pencil" size={12} />
              Изменить
            </button>
            <button
              onClick={() => onRejectSuggestion(i)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
            >
              <Icon name="X" size={12} />
              Отклонить
            </button>
          </div>
        </div>
      )}

      {m.role === 'ai' && m.status === 'applied' && (
        <div className="mt-1 text-[11px] text-emerald-700 flex items-center gap-1">
          <Icon name="CheckCircle2" size={12} /> Применено
        </div>
      )}
      {m.role === 'ai' && m.status === 'rejected' && (
        <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
          <Icon name="XCircle" size={12} /> Отклонено
        </div>
      )}

      {m.role === 'ai' && m.agentActions && m.agentActions.length > 0 && (
        <div className="mt-2 w-full max-w-[95%] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Icon name="Bot" size={12} />
              Предложено действий: {m.agentActions.length}
            </div>
            {m.agentActions.some(a => a.status === 'pending') && (
              <button
                onClick={() => onConfirmAllAgentActions(i)}
                className="text-[11px] btn-blue text-white px-2 py-1 rounded-md font-semibold inline-flex items-center gap-1"
              >
                <Icon name="CheckCheck" size={12} /> Подтвердить всё
              </button>
            )}
          </div>
          {m.agentActions.map((a, j) => {
            const meta = ACTION_LABELS[a.type] || { label: a.type, icon: 'Zap' };
            return (
              <div key={j} className="border border-border rounded-xl p-3 bg-white">
                <div className="flex items-start gap-2 mb-1.5">
                  <div className="mt-0.5 w-7 h-7 rounded-lg bg-brand-blue/10 flex items-center justify-center shrink-0">
                    <Icon name={meta.icon} size={14} className="text-brand-blue" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-semibold">{a.title || meta.label}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${RISK_STYLES[a.risk] || 'bg-muted'}`}>
                        {a.risk === 'high' ? 'риск' : a.risk === 'medium' ? 'средне' : 'безопасно'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                    {a.params && Object.keys(a.params).length > 0 && (
                      <details className="mt-1.5">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Параметры</summary>
                        <pre className="text-[10px] bg-muted/50 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(a.params, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </div>

                {a.status === 'pending' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onConfirmAgentAction(i, j)}
                      className="flex-1 btn-blue text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <Icon name="Check" size={12} /> Подтвердить
                    </button>
                    <button
                      onClick={() => onRejectAgentAction(i, j)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                    >
                      <Icon name="X" size={12} /> Отклонить
                    </button>
                  </div>
                )}
                {a.status === 'applied' && (
                  <div className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                    <Icon name="CheckCircle2" size={12} />
                    {a.resultMessage || 'Выполнено'}
                  </div>
                )}
                {a.status === 'failed' && (
                  <div className="mt-2 text-[11px] text-red-600 flex items-center gap-1">
                    <Icon name="AlertTriangle" size={12} />
                    {a.resultMessage || 'Ошибка'}
                  </div>
                )}
                {a.status === 'rejected' && (
                  <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                    <Icon name="XCircle" size={12} /> Отклонено
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}