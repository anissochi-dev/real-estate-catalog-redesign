import Icon from '@/components/ui/icon';
import { Lead, Comment, STATUSES, LEAD_TYPES, SOURCE_LABELS } from './leadsTypes';
import { formatPhone } from '@/lib/phone';

interface Props {
  active: Lead;
  comments: Comment[];
  comment: string;
  setComment: (v: string) => void;
  aiReply: string;
  aiLoading: boolean;
  onUpdate: (changes: Partial<Lead>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSendComment: () => void;
  onGenerateReply: () => void;
}

export default function LeadDetail({
  active, comments, comment, setComment, aiReply, aiLoading,
  onUpdate, onEdit, onDelete, onSendComment, onGenerateReply,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="font-display font-700 text-lg">{active.name}</div>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
              <a href={`tel:${active.phone}`}
                 className={`font-mono hover:underline ${active.phone_hidden ? 'text-muted-foreground' : 'text-brand-blue'}`}>
                {active.phone ? formatPhone(active.phone) : '—'}
              </a>
              {active.phone_hidden && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                      title="Заявка брокера — телефон собственника видят только админ, директор и сам брокер.">
                  <Icon name="EyeOff" size={10} /> Скрыт
                </span>
              )}
              {active.email && <span>· {active.email}</span>}
            </div>
            {active.company && (
              <div className="text-xs text-muted-foreground mt-1">Компания: {active.company}</div>
            )}
            {active.budget && (
              <div className="text-xs text-muted-foreground">Бюджет: {active.budget.toLocaleString('ru')} ₽</div>
            )}
            {active.object_url && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="Link" size={12} className="text-brand-blue flex-shrink-0" />
                <a href={active.object_url} target="_blank" rel="noopener noreferrer"
                  className="text-brand-blue hover:underline truncate max-w-xs">
                  {active.object_url.replace(/^https?:\/\/[^/]+/, '')}
                </a>
              </div>
            )}
            {active.source && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                Источник:{' '}
                {active.object_url ? (
                  <a href={active.object_url} target="_blank" rel="noopener noreferrer"
                    className="font-medium text-brand-blue hover:underline flex items-center gap-0.5">
                    {SOURCE_LABELS[active.source] || active.source}
                    <Icon name="ExternalLink" size={11} />
                  </a>
                ) : (
                  <span className="font-medium">{SOURCE_LABELS[active.source] || active.source}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onEdit} className="text-brand-blue p-2 rounded-lg hover:bg-muted">
              <Icon name="Pencil" size={16} />
            </button>
            <button onClick={onDelete} className="text-red-600 p-2 rounded-lg hover:bg-red-50">
              <Icon name="Trash2" size={16} />
            </button>
          </div>
        </div>

        {active.message && (
          <div className="mt-4 p-3 bg-muted/50 rounded-xl text-sm">{active.message}</div>
        )}

        {active.status === 'pending' && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-orange-800 flex items-center gap-2">
              <Icon name="ShieldAlert" size={16} />
              <span>Лид с сайта — требует модерации</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onUpdate({ status: 'new' })}
                className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg font-semibold inline-flex items-center gap-1.5">
                <Icon name="CheckCircle2" size={13} /> Одобрить
              </button>
              <button onClick={() => onUpdate({ status: 'rejected' })}
                className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg font-semibold inline-flex items-center gap-1.5">
                <Icon name="XCircle" size={13} /> Отклонить
              </button>
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs text-muted-foreground mb-1.5">Тип заявки:</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {LEAD_TYPES.map(t => (
              <button key={t[0]} onClick={() => onUpdate({ lead_type: t[0] })}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  (active.lead_type || 'view') === t[0] ? t[2] + ' ring-1 ring-inset ring-current' : 'bg-muted hover:bg-muted/70'
                }`}>
                {t[1]}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mb-1.5">Статус:</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(s => (
              <button key={s[0]} onClick={() => onUpdate({ status: s[0] })}
                className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition ${
                  active.status === s[0] ? `${s[2]} text-white` : 'bg-muted hover:bg-muted/70'
                }`}>
                <span className={`w-2 h-2 rounded-full ${active.status === s[0] ? 'bg-white' : s[2]}`} />
                {s[1]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active.is_network_tenant}
              onChange={e => onUpdate({ is_network_tenant: e.target.checked })} />
            Сетевой арендатор
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active.show_on_main}
              onChange={e => onUpdate({ show_on_main: e.target.checked })} />
            Показывать на главной
          </label>
        </div>
      </div>

      <div className="p-5 border-b border-border space-y-2">
        <div className="flex justify-between items-center">
          <div className="font-semibold text-sm">Черновик ответа клиенту</div>
          <button onClick={onGenerateReply} disabled={aiLoading}
            className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
            <Icon name="Sparkles" size={12} />
            {aiLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
          </button>
        </div>
        {aiReply && (
          <div className="p-3 bg-brand-orange/10 border border-brand-orange/30 rounded-xl text-sm whitespace-pre-wrap">
            {aiReply}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="font-semibold text-sm mb-3">Комментарии</div>
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="p-3 bg-muted/40 rounded-xl text-sm">
              <div className="text-xs text-muted-foreground mb-1">
                {c.author_name} · {new Date(c.created_at).toLocaleString('ru')}
              </div>
              {c.comment}
            </div>
          ))}
          {comments.length === 0 && (
            <div className="text-sm text-muted-foreground">Нет комментариев</div>
          )}
        </div>
        <div className="flex gap-2">
          <input value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Добавить комментарий..."
            className="flex-1 px-3 py-2 border rounded-xl text-sm" />
          <button onClick={onSendComment} className="btn-blue text-white px-4 rounded-xl">
            <Icon name="Send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}