import Icon from '@/components/ui/icon';
import PhonePickerInput from '@/components/admin/PhonePickerInput';
import { Lead, LeadExtraContact } from './leadsTypes';

const MAX_LEAD_EXTRA_CONTACTS = 3;

interface Props {
  editing: Partial<Lead>;
  setEditing: (l: Partial<Lead> | null) => void;
  errors: Record<string, boolean>;
  contactLocked: boolean;
}

export default function LeadEditContactsSection({ editing, setEditing, errors, contactLocked }: Props) {
  const extraContacts: LeadExtraContact[] = editing.extra_contacts || [];
  const updateExtraContact = (idx: number, patch: Partial<LeadExtraContact>) => {
    const next = extraContacts.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setEditing({ ...editing, extra_contacts: next });
  };
  const addExtraContact = () => {
    if (extraContacts.length >= MAX_LEAD_EXTRA_CONTACTS) return;
    setEditing({ ...editing, extra_contacts: [...extraContacts, { name: '', phone: '', phone2: '' }] });
  };
  const removeExtraContact = (idx: number) => {
    setEditing({ ...editing, extra_contacts: extraContacts.filter((_, i) => i !== idx) });
  };

  return (
    <>
    <div className="relative">
      <input className={`w-full px-3 py-2 border rounded-lg pr-16 ${errors.name ? 'border-red-400 bg-red-50' : ''} ${contactLocked ? 'bg-muted/50 text-muted-foreground cursor-not-allowed' : ''}`} placeholder="Имя клиента"
        maxLength={60}
        value={editing.name || ''}
        readOnly={contactLocked}
        onChange={e => !contactLocked && setEditing({ ...editing, name: e.target.value })} />
      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
        (editing.name?.length || 0) >= 55 ? 'text-red-500' : 'text-muted-foreground'
      }`}>
        {editing.name?.length || 0}/60
      </span>
    </div>
    <div>
      <label className="text-xs text-muted-foreground">
        Телефон
        {contactLocked && <span className="ml-1.5 text-[10px] text-muted-foreground">(изменён быть не может)</span>}
      </label>
      <div className={errors.phone ? 'rounded-lg ring-1 ring-red-400 bg-red-50' : ''}>
        <PhonePickerInput
          value={editing.phone || ''}
          onChange={(phone, name) => setEditing({ ...editing, phone, ...(name && !editing.name ? { name } : {}) })}
          onNameChange={name => { if (!editing.name) setEditing({ ...editing, name }); }}
          readOnly={contactLocked}
        />
      </div>
    </div>
    <div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon name="PhonePlus" size={11} className="text-slate-500" /></span>Доп. телефон
      </label>
      <PhonePickerInput
        value={editing.phone2 || ''}
        onChange={phone => setEditing({ ...editing, phone2: phone })}
      />
    </div>
    <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email (необязательно)"
      value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
    <input className="w-full px-3 py-2 border rounded-lg" placeholder="Компания (для сетевых)"
      value={editing.company || ''} onChange={e => setEditing({ ...editing, company: e.target.value })} />

    {/* Доп. контакты заявки */}
    {!contactLocked && (
      <div className="space-y-3">
        {extraContacts.map((contact, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-dashed border-border rounded-lg p-3 relative">
            <button
              type="button"
              onClick={() => removeExtraContact(idx)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-red-500"
              title="Удалить контакт"
            >
              <Icon name="X" size={14} />
            </button>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Icon name="User" size={11} className="text-brand-blue" /></span>Имя
              </label>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={contact.name || ''}
                onChange={e => updateExtraContact(idx, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0"><Icon name="Phone" size={11} className="text-emerald-600" /></span>Телефон
              </label>
              <PhonePickerInput
                value={contact.phone || ''}
                onChange={(phone, name) => updateExtraContact(idx, { phone, ...(name && !contact.name ? { name } : {}) })}
              />
            </div>
            <div className="sm:col-start-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon name="PhonePlus" size={11} className="text-slate-500" /></span>Доп. телефон
              </label>
              <PhonePickerInput
                value={contact.phone2 || ''}
                onChange={phone => updateExtraContact(idx, { phone2: phone })}
              />
            </div>
          </div>
        ))}
        {extraContacts.length < MAX_LEAD_EXTRA_CONTACTS && (
          <button
            type="button"
            onClick={addExtraContact}
            className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
          >
            <Icon name="Plus" size={14} />
            Добавить контакты
          </button>
        )}
      </div>
    )}
    </>
  );
}
