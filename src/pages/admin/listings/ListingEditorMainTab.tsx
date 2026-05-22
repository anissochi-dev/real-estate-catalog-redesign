import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import PhonePickerInput from '@/components/admin/PhonePickerInput';
import { Listing, CATS, DEALS, CONDITIONS, PURPOSE_LIST } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  errors: Record<string, boolean>;
  setErrors: (fn: (v: Record<string, boolean>) => Record<string, boolean>) => void;
}

const MAX_PURPOSES = 10;

export default function ListingEditorMainTab({ editing, setEditing, errors, setErrors }: Props) {
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [purposeSearch, setPurposeSearch] = useState('');
  const purposeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!purposeOpen) return;
    const handler = (e: MouseEvent) => {
      if (purposeRef.current && !purposeRef.current.contains(e.target as Node)) {
        setPurposeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [purposeOpen]);

  const selectedPurposes: string[] = editing.purpose
    ? editing.purpose.split('|').map(s => s.trim()).filter(Boolean)
    : [];

  const togglePurpose = (name: string) => {
    if (!selectedPurposes.includes(name) && selectedPurposes.length >= MAX_PURPOSES) return;
    const cur = selectedPurposes.includes(name)
      ? selectedPurposes.filter(p => p !== name)
      : [...selectedPurposes, name];
    setEditing({ ...editing, purpose: cur.join('|') });
  };

  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const errWrap = (field: string) => errors[field] ? { 'data-field-error': 'true' as const } : {};

  return (
    <div className="space-y-4">
      {/* Название */}
      <div className="space-y-1.5" {...errWrap('title')}>
        <label className="text-xs text-muted-foreground">Название объекта *</label>
        <div className="relative">
          <input className={`w-full px-3 py-2 border rounded-lg pr-16 ${err('title')}`}
            placeholder="Аренда офиса, продажа склада..."
            maxLength={120}
            value={editing.title || ''}
            onChange={e => { setEditing({ ...editing, title: e.target.value }); setErrors(v => ({ ...v, title: false })); }} />
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
            (editing.title?.length || 0) >= 110 ? 'text-red-500' : 'text-muted-foreground'
          }`}>
            {editing.title?.length || 0}/120
          </span>
        </div>
        {editing.deal && editing.category && (() => {
          const dealLabels: Record<string, string> = { sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес' };
          const catLabels: Record<string, string> = {
            office: 'офиса', retail: 'торгового помещения', warehouse: 'склада',
            restaurant: 'помещения под общепит', hotel: 'гостиницы', business: 'готового бизнеса',
            gab: 'ГАБ', production: 'производственного помещения', land: 'земельного участка',
            building: 'отдельно стоящего здания', free_purpose: 'помещения свободного назначения',
            car_service: 'автосервиса',
          };
          const suggestion = `${dealLabels[editing.deal] || editing.deal} ${catLabels[editing.category] || editing.category}`;
          const hasIt = (editing.title || '').toLowerCase().includes(dealLabels[editing.deal]?.toLowerCase() || '');
          if (hasIt) return null;
          return (
            <button type="button"
              onClick={() => setEditing({ ...editing, title: `${suggestion}${editing.title ? ' — ' + editing.title : ''}` })}
              className="text-xs text-brand-blue hover:underline flex items-center gap-1">
              + Добавить в начало: «{suggestion}»
            </button>
          );
        })()}
      </div>

      {/* Категория, сделка, состояние */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div {...errWrap('category')}>
          <label className="text-xs text-muted-foreground">Категория *</label>
          <select className={`w-full px-3 py-2 border rounded-lg text-sm ${err('category')}`} value={editing.category || ''}
            onChange={e => { setEditing({ ...editing, category: e.target.value }); setErrors(v => ({ ...v, category: false })); }}>
            <option value="">— Выберите категорию —</option>
            {CATS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
          </select>
        </div>
        <div {...errWrap('deal')}>
          <label className="text-xs text-muted-foreground">Тип сделки *</label>
          <select className={`w-full px-3 py-2 border rounded-lg text-sm ${err('deal')}`} value={editing.deal || ''}
            onChange={e => { setEditing({ ...editing, deal: e.target.value }); setErrors(v => ({ ...v, deal: false })); }}>
            <option value="">— Выберите тип сделки —</option>
            {DEALS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
          </select>
        </div>
        <div {...errWrap('condition')}>
          <label className="text-xs text-muted-foreground">Состояние *</label>
          <select className={`w-full px-3 py-2 border rounded-lg text-sm ${err('condition')}`} value={editing.condition || ''}
            onChange={e => { setEditing({ ...editing, condition: e.target.value }); setErrors(v => ({ ...v, condition: false })); }}>
            <option value="">— Не выбрано —</option>
            {CONDITIONS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
          </select>
        </div>
      </div>

      {/* Назначение */}
      <div>
        <label className="text-xs text-muted-foreground">
          Назначение (можно выбрать несколько, максимум {MAX_PURPOSES})
          {selectedPurposes.length >= MAX_PURPOSES && (
            <span className="ml-2 text-amber-600 font-medium">— достигнут лимит</span>
          )}
        </label>
        <div className="relative mt-1" ref={purposeRef}>
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Icon name="Search" size={14} className="ml-3 text-muted-foreground flex-shrink-0" />
            <input
              value={purposeSearch}
              onChange={e => { setPurposeSearch(e.target.value); setPurposeOpen(true); }}
              onFocus={() => setPurposeOpen(true)}
              placeholder={selectedPurposes.length > 0 ? `Выбрано: ${selectedPurposes.length}` : 'Начните вводить...'}
              className="flex-1 px-2 py-2 text-sm outline-none"
            />
            {selectedPurposes.length > 0 && (
              <span className="mr-2 text-xs bg-brand-blue text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
                {selectedPurposes.length}
              </span>
            )}
          </div>
          {purposeOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {PURPOSE_LIST
                .filter(name => !purposeSearch || name.toLowerCase().includes(purposeSearch.toLowerCase()))
                .map(name => {
                  const isChecked = selectedPurposes.includes(name);
                  const isDisabled = !isChecked && selectedPurposes.length >= MAX_PURPOSES;
                  return (
                    <label key={name} className={`flex items-center gap-2 px-3 py-2 text-sm ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}>
                      <input type="checkbox" checked={isChecked} onChange={() => togglePurpose(name)} disabled={isDisabled} className="accent-brand-blue" />
                      {name}
                    </label>
                  );
                })}
              {PURPOSE_LIST.filter(n => !purposeSearch || n.toLowerCase().includes(purposeSearch.toLowerCase())).length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Не найдено</div>
              )}
            </div>
          )}
        </div>
        {selectedPurposes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {selectedPurposes.map(name => (
              <span key={name} className="inline-flex items-center gap-1 text-xs bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full">
                {name}
                <button type="button" onClick={() => togglePurpose(name)} className="hover:text-red-500">
                  <Icon name="X" size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Собственник */}
      <div className="border-t border-border pt-4">
        <div className="text-sm font-semibold mb-3">Собственник</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div {...errWrap('owner_name')}>
            <label className="text-xs text-muted-foreground">Имя *</label>
            <input className={`w-full px-3 py-2 border rounded-lg ${err('owner_name')}`}
              value={editing.owner_name || ''}
              onChange={e => { setEditing({ ...editing, owner_name: e.target.value }); setErrors(v => ({ ...v, owner_name: false })); }} />
          </div>
          <div {...errWrap('owner_phone')}>
            <label className="text-xs text-muted-foreground">Телефон *</label>
            <PhonePickerInput
              value={editing.owner_phone || ''}
              onChange={(phone, name, phoneContactId) => {
                const update: Partial<typeof editing> = { owner_phone: phone };
                if (name) update.owner_name = name;
                if (phoneContactId) (update as Record<string, unknown>).owner_phone_contact_id = phoneContactId;
                setEditing({ ...editing, ...update });
                setErrors(v => ({ ...v, owner_phone: false }));
              }}
              onNameChange={name => { if (!editing.owner_name) setEditing({ ...editing, owner_name: name }); }}
            />
          </div>
          <div className="sm:col-start-2">
            <label className="text-xs text-muted-foreground">Доп. телефон</label>
            <PhonePickerInput
              value={(editing as Record<string, unknown>).owner_phone2 as string || ''}
              onChange={phone => setEditing({ ...editing, owner_phone2: phone } as typeof editing)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
