import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Lead, Listing } from './leadsTypes';
import { District } from '../districts/DistrictsTypes';
import LeadEditContactsSection from './LeadEditContactsSection';
import LeadEditRequestSection from './LeadEditRequestSection';
import LeadEditLinkSection from './LeadEditLinkSection';

interface Props {
  editing: Partial<Lead>;
  setEditing: (l: Partial<Lead> | null) => void;
  listings: Listing[];
  districts: District[];
  listingSearch: string;
  setListingSearch: (v: string) => void;
  listingDropOpen: boolean;
  setListingDropOpen: (v: boolean) => void;
  onSave: () => void;
  /** Брокер задаёт телефон и имя клиента один раз — при повторном
   * редактировании уже существующей заявки эти поля блокируются. */
  lockContactFields?: boolean;
}

export default function LeadEditModal({
  editing, setEditing, listings, districts,
  listingSearch, setListingSearch,
  listingDropOpen, setListingDropOpen,
  onSave, lockContactFields = false,
}: Props) {
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const contactLocked = lockContactFields && !!editing.id && !!editing.name && !!editing.phone;

  const validate = (): boolean => {
    const e: Record<string, boolean> = {};
    if (!editing.name?.trim()) e.name = true;
    if (!editing.phone?.trim()) e.phone = true;
    if (!editing.property_type) e.property_type = true;
    if (!editing.property_category) e.property_category = true;
    if (editing.budget_to == null) e.budget_to = true;
    if (editing.area_to == null) e.area_to = true;
    if (!editing.district_ids || editing.district_ids.length === 0) e.district_ids = true;
    if (!editing.message?.trim()) e.message = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) onSave();
    else toast.error('Заполните все обязательные поля, отмеченные звёздочкой');
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
      <div className="bg-white rounded-2xl max-w-lg w-full flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-border flex justify-between items-center flex-shrink-0 bg-white rounded-t-2xl">
          <div className="font-display font-700 text-lg">
            {editing.id ? 'Редактировать лид' : 'Новый лид'}
          </div>
          <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <LeadEditContactsSection
            editing={editing}
            setEditing={setEditing}
            errors={errors}
            contactLocked={contactLocked}
          />

          <LeadEditRequestSection
            editing={editing}
            setEditing={setEditing}
            districts={districts}
            errors={errors}
          />

          <LeadEditLinkSection
            editing={editing}
            setEditing={setEditing}
            listings={listings}
            listingSearch={listingSearch}
            setListingSearch={setListingSearch}
            listingDropOpen={listingDropOpen}
            setListingDropOpen={setListingDropOpen}
          />
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-3 flex-shrink-0 bg-white rounded-b-2xl">
          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
          <button onClick={handleSave} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
