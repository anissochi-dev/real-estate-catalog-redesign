import { useEffect, useState } from 'react';
import { adminApi, uploadFile } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { formatPhone } from '@/lib/phone';
import { PhoneContact, HistoryEntry, PhoneForm, Tab } from './phone-card/types';
import PhoneCardHeader from './phone-card/PhoneCardHeader';
import PhoneCardInfoTab from './phone-card/PhoneCardInfoTab';
import PhoneCardLinksTab from './phone-card/PhoneCardLinksTab';
import PhoneCardHistoryTab from './phone-card/PhoneCardHistoryTab';

interface Props {
  contactId: number;
  onClose: () => void;
  onUpdate?: () => void;
  onOpenListing?: (listingId: number) => void;
  onOpenLead?: (leadId: number) => void;
}

export default function PhoneCardModal({ contactId, onClose, onUpdate, onOpenListing, onOpenLead }: Props) {
  const { user } = useAuth();
  const canUnlink = !!user?.role && ['admin', 'director'].includes(user.role);
  const isBoss = canUnlink;
  const [contact, setContact] = useState<PhoneContact | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState<Tab>('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PhoneForm>({ name: '', company: '', notes: '', tags: '', inn: '', photo_url: '' });
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(formatPhone(phone)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const load = () => {
    adminApi.getPhone(contactId).then(r => {
      const c: PhoneContact = r.contact;
      setContact(c);
      setForm({
        name: c.name || '',
        company: c.company || '',
        notes: c.notes || '',
        tags: c.tags || '',
        inn: c.inn || '',
        photo_url: c.photo_url || '',
      });
    });
  };

  const loadHistory = () => {
    if (!isBoss) return;
    adminApi.getPhoneHistory(contactId).then(r => setHistory(r.history || [])).catch(() => {});
  };

  useEffect(() => {
    load();
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updatePhone(contactId, form);
      setEditing(false);
      load();
      loadHistory();
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setPhotoUploading(true);
    try {
      const url = await uploadFile(file, 'photos');
      setForm(f => ({ ...f, photo_url: url }));
    } catch (e: unknown) {
      alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setPhotoUploading(false);
    }
  };

  const unlink = async (type: 'listing' | 'lead', id: number) => {
    if (type === 'listing') await adminApi.unlinkPhone(contactId, { listing_id: id });
    else await adminApi.unlinkPhone(contactId, { lead_id: id });
    load();
    loadHistory();
    onUpdate?.();
  };

  const deleteContact = async () => {
    if (!confirm('Переместить номер в корзину? Связи сохранятся, номер можно будет восстановить в «Удалённых».')) return;
    await adminApi.deletePhone(contactId);
    onUpdate?.();
    onClose();
  };

  const restoreContact = async () => {
    await adminApi.restorePhone(contactId);
    load();
    loadHistory();
    onUpdate?.();
  };

  const purgeContact = async () => {
    if (!confirm('Удалить номер НАВСЕГДА? История и все связи будут стёрты, восстановить будет нельзя.')) return;
    await adminApi.purgePhone(contactId);
    onUpdate?.();
    onClose();
  };

  if (!contact) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
          <Icon name="Loader2" size={20} className="animate-spin text-brand-blue" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">

        <PhoneCardHeader
          contact={contact}
          isBoss={isBoss}
          copied={copied}
          onCopyPhone={copyPhone}
          onDelete={deleteContact}
          onRestore={restoreContact}
          onPurge={purgeContact}
          onClose={onClose}
        />

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {([['info', 'Карточка', 'User'], ['links', 'Связи', 'Link'], ...(isBoss ? [['history', 'История', 'Clock']] : [])] as [Tab, string, string][]).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                tab === id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {tab === 'info' && (
            <PhoneCardInfoTab
              contact={contact}
              editing={editing}
              setEditing={setEditing}
              form={form}
              setForm={setForm}
              saving={saving}
              photoUploading={photoUploading}
              onSave={save}
              onUploadPhoto={uploadPhoto}
            />
          )}

          {tab === 'links' && (
            <PhoneCardLinksTab
              contact={contact}
              canUnlink={canUnlink}
              onUnlink={unlink}
              onOpenListing={onOpenListing}
              onOpenLead={onOpenLead}
              onClose={onClose}
            />
          )}

          {tab === 'history' && isBoss && (
            <PhoneCardHistoryTab history={history} />
          )}
        </div>
      </div>
    </div>
  );
}
