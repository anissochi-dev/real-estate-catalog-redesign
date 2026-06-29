import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { formatPhone } from '@/lib/phone';
import { setPhoneFlag, removePhoneFlag, type PhoneFlag, type FlagType } from '@/hooks/usePhoneFlag';

const FLAG_LABELS: Record<FlagType, string> = {
  bad_owner: 'Плохой собственник',
  competitor: 'Брокер-конкурент',
};

interface Props {
  phone: string;
  current: PhoneFlag | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function PhoneBookFlagModal({ phone, current, token, onClose, onSaved }: Props) {
  const [type, setType] = useState<FlagType>(current?.flag_type || 'bad_owner');
  const [comment, setComment] = useState(current?.comment || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setPhoneFlag(phone, type, comment, token);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await removePhoneFlag(phone, token);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-display font-700 text-base">Отметить номер</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Icon name="X" size={18} /></button>
        </div>
        <div className="font-mono text-brand-blue font-semibold">{formatPhone(phone)}</div>
        <div className="space-y-2">
          {(['bad_owner', 'competitor'] as FlagType[]).map(ft => (
            <button key={ft} onClick={() => setType(ft)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition text-sm font-medium flex items-center gap-2 ${type === ft ? (ft === 'bad_owner' ? 'border-red-400 bg-red-50 text-red-700' : 'border-orange-400 bg-orange-50 text-orange-700') : 'border-border hover:bg-muted/50'}`}>
              <span className={`w-3 h-3 rounded-full shrink-0 ${ft === 'bad_owner' ? 'bg-red-500' : 'bg-orange-400'}`} />
              {FLAG_LABELS[ft]}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Комментарий</label>
          <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
            placeholder="Коротко — почему отмечаете этот номер"
            value={comment} onChange={e => setComment(e.target.value.slice(0, 300))} />
          <div className="text-right text-[11px] text-muted-foreground">{comment.length}/300</div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold flex-1">
            {saving ? 'Сохранение...' : current ? 'Обновить' : 'Отметить'}
          </button>
          {current && (
            <button onClick={remove} disabled={saving}
              className="px-4 py-2 rounded-xl text-sm border border-red-200 text-red-600 hover:bg-red-50">
              Снять
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">Отмена</button>
        </div>
      </div>
    </div>
  );
}
