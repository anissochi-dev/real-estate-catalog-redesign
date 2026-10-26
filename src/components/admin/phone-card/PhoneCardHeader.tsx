import Icon from '@/components/ui/icon';
import { formatPhone } from '@/lib/phone';
import { PhoneContact, fmtDt } from './types';

interface Props {
  contact: PhoneContact;
  isBoss: boolean;
  copied: boolean;
  onCopyPhone: (phone: string) => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onClose: () => void;
}

export default function PhoneCardHeader({ contact, isBoss, copied, onCopyPhone, onDelete, onRestore, onPurge, onClose }: Props) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        {contact.photo_url ? (
          <img src={contact.photo_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
            <Icon name="User" size={22} className="text-brand-blue" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="font-display font-700 text-base font-mono tracking-wide">{formatPhone(contact.phone)}</div>
            <button
              type="button"
              onClick={() => onCopyPhone(contact.phone)}
              title="Скопировать номер"
              className={`p-1 rounded transition ${copied ? 'text-emerald-600' : 'text-muted-foreground hover:text-brand-blue'}`}
            >
              <Icon name={copied ? 'Check' : 'Copy'} size={13} />
            </button>
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {[contact.name, contact.company].filter(Boolean).join(' · ') || 'Без имени'}
          </div>
          <div className="text-xs text-muted-foreground">
            Добавлен {fmtDt(contact.created_at)}
          </div>
        </div>
        {isBoss && !contact.trashed_at && (
          <button onClick={onDelete} title="Удалить в корзину"
            className="p-2 rounded-lg hover:bg-red-50 text-red-500 shrink-0">
            <Icon name="Trash2" size={16} />
          </button>
        )}
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0">
          <Icon name="X" size={18} />
        </button>
      </div>

      {contact.trashed_at && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-red-50 border-b border-red-100 text-sm">
          <Icon name="Trash2" size={14} className="text-red-600" />
          <span className="flex-1 min-w-0 text-red-800">
            В корзине с {fmtDt(contact.trashed_at)}{contact.trashed_by_name ? ` · удалил ${contact.trashed_by_name}` : ''}
          </span>
          {isBoss && (
            <>
              <button onClick={onRestore} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-blue text-white text-xs font-semibold">
                <Icon name="RotateCcw" size={12} /> Восстановить
              </button>
              <button onClick={onPurge} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-100">
                Удалить навсегда
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
