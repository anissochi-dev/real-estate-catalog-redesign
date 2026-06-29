import { useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { formatPhone, normalizePhone, extractDigits } from '@/lib/phone';

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

export default function PhoneBookAddModal({ onClose, onAdded }: Props) {
  const [form, setForm] = useState({ phone: '', name: '', company: '', notes: '' });
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [existingId, setExistingId] = useState<number | null>(null);
  const [lookupTimer, setLookupTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractDigits(e.target.value).slice(0, 10);
    const normalized = digits ? '+7' + digits : '';
    setPhoneDisplay(digits ? formatPhone(normalized) : '');
    setForm(f => ({ ...f, phone: normalized }));
    setErr('');
    setExistingId(null);

    if (lookupTimer) clearTimeout(lookupTimer);
    if (digits.length === 10) {
      setLookingUp(true);
      const t = setTimeout(async () => {
        try {
          const res = await adminApi.searchPhones(normalized);
          const exact = (res.contacts || []).find(
            (c: { phone: string }) => extractDigits(c.phone) === digits
          );
          if (exact) {
            setExistingId(exact.id);
            setForm(f => ({
              ...f,
              name: f.name || exact.name || '',
              company: f.company || exact.company || '',
              notes: f.notes || exact.notes || '',
            }));
          }
        } catch { /* ignore */ }
        finally { setLookingUp(false); }
      }, 350);
      setLookupTimer(t);
    } else {
      setLookingUp(false);
    }
  };

  const save = async () => {
    const digits = extractDigits(form.phone);
    if (!form.phone.trim() || digits.length === 0) { setErr('Введите номер телефона'); return; }
    if (digits.length < 10) { setErr('Номер телефона введён не полностью — должно быть 10 цифр'); return; }
    setSaving(true);
    setErr('');
    try {
      const normalized = normalizePhone(form.phone);
      if (existingId) {
        await adminApi.updatePhone(existingId, { name: form.name, company: form.company, notes: form.notes });
      } else {
        await adminApi.createPhone({ ...form, phone: normalized });
      }
      onAdded();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const isComplete = extractDigits(form.phone).length === 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="font-display font-700 text-base">
            {existingId ? 'Дополнить контакт' : 'Новый контакт'}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><Icon name="X" size={18} /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Телефон *</label>
          <div className="relative">
            <input
              type="tel"
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono tracking-wide pr-8 ${
                existingId ? 'border-brand-blue bg-brand-blue/5' : 'border-border'
              }`}
              placeholder="+7 900 000-00-00"
              value={phoneDisplay}
              onChange={handlePhoneChange}
              autoComplete="off"
            />
            {lookingUp && (
              <Icon name="Loader2" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            )}
            {!lookingUp && isComplete && existingId && (
              <Icon name="UserCheck" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-blue" />
            )}
            {!lookingUp && isComplete && !existingId && (
              <Icon name="UserPlus" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />
            )}
          </div>
          {existingId ? (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-brand-blue">
              <Icon name="Info" size={11} />
              Контакт найден в базе — данные будут дополнены
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-muted-foreground">Пример: <span className="font-mono">+7 900 123-45-67</span></div>
          )}
        </div>

        {[['name', 'Имя'], ['company', 'Компания']].map(([k, l]) => (
          <div key={k}>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{l}</label>
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as Record<string, string>)[k]}
              onChange={e => setForm({ ...form, [k]: e.target.value })}
            />
          </div>
        ))}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Заметки</label>
          <textarea className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={2}
            value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        {err && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <Icon name="AlertCircle" size={14} className="shrink-0" />
            {err}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            {saving ? 'Сохранение...' : existingId ? 'Дополнить' : 'Добавить'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-border hover:bg-muted">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
