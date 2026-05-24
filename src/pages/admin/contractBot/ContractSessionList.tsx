import Icon from '@/components/ui/icon';
import { CONTRACT_TYPES, DOC_TYPES, Session, getTypeLabel } from './types';

interface Props {
  sessions: Session[];
  loading: boolean;
  tab: 'draft' | 'done';
  setTab: (t: 'draft' | 'done') => void;
  newForm: { title: string; contract_type: string; conditions_text: string };
  setNewForm: (f: { title: string; contract_type: string; conditions_text: string }) => void;
  creating: boolean;
  onCreateSession: () => void;
  onOpenSession: (s: Session) => void;
}

export default function ContractSessionList({
  sessions, loading, tab, setTab,
  newForm, setNewForm, creating, onCreateSession, onOpenSession,
}: Props) {
  const drafts = sessions.filter(s => s.status !== 'filled');
  const done   = sessions.filter(s => s.status === 'filled');
  const shown  = tab === 'draft' ? drafts : done;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-700 text-lg">Бот договоров</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Виртуальный брокер заполняет договоры на основе документов сторон</p>
        </div>
      </div>

      {/* Форма создания */}
      <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Icon name="FilePlus2" size={16} className="text-brand-blue" />
          Новый договор
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={newForm.title}
            onChange={e => setNewForm({ ...newForm, title: e.target.value })}
            placeholder="Название договора..."
            className="px-3 py-2 border rounded-xl text-sm"
          />
          <select
            value={newForm.contract_type}
            onChange={e => setNewForm({ ...newForm, contract_type: e.target.value })}
            className="px-3 py-2 border rounded-xl text-sm bg-white"
          >
            {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <textarea
          value={newForm.conditions_text}
          onChange={e => setNewForm({ ...newForm, conditions_text: e.target.value })}
          placeholder="Опишите условия сделки: предмет договора, сроки, суммы, особые условия..."
          rows={3}
          className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
        />
        <button onClick={onCreateSession} disabled={creating}
          className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          {creating ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Plus" size={14} />}
          Создать
        </button>
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('draft')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'draft' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          Черновики <span className="ml-1 text-xs text-muted-foreground">({drafts.length})</span>
        </button>
        <button onClick={() => setTab('done')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'done' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          Готовые <span className="ml-1 text-xs text-muted-foreground">({done.length})</span>
        </button>
      </div>

      {/* Список */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin mx-auto mb-2" />Загрузка...
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="FileStack" size={36} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm">{tab === 'draft' ? 'Черновиков нет.' : 'Готовых договоров пока нет.'}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(s => (
            <button key={s.id} onClick={() => onOpenSession(s)}
              className="w-full bg-white rounded-2xl border border-border px-5 py-4 text-left hover:border-brand-blue/30 hover:shadow-sm transition flex items-center gap-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.status === 'filled' ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                <Icon name={s.status === 'filled' ? 'CheckCircle2' : 'FileText'} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{s.title}</div>
                <div className="text-xs text-muted-foreground">{getTypeLabel(s.contract_type)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {s.status === 'filled' ? 'Готов' : 'Черновик'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(s.updated_at).toLocaleDateString('ru')}</div>
              </div>
              <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// re-export so ContractBotAdmin can import DOC_TYPES from here without touching types.ts
export { DOC_TYPES };