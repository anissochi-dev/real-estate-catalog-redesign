import { Dispatch, SetStateAction } from 'react';
import Icon from '@/components/ui/icon';
import { PhoneContact, PhoneForm } from './types';

interface Props {
  contact: PhoneContact;
  editing: boolean;
  setEditing: (v: boolean) => void;
  form: PhoneForm;
  setForm: Dispatch<SetStateAction<PhoneForm>>;
  saving: boolean;
  photoUploading: boolean;
  onSave: () => void;
  onUploadPhoto: (file: File) => void;
}

export default function PhoneCardInfoTab({ contact, editing, setEditing, form, setForm, saving, photoUploading, onSave, onUploadPhoto }: Props) {
  return (
    <div className="p-5 space-y-4">
      {editing ? (
        <div className="space-y-3">
          {/* Photo upload */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Фото</label>
            <div className="flex items-center gap-3">
              {form.photo_url && (
                <img src={form.photo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-border" />
              )}
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-sm hover:border-brand-blue transition">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && onUploadPhoto(e.target.files[0])}
                />
                {photoUploading
                  ? <><Icon name="Loader2" size={14} className="animate-spin" /> Загрузка...</>
                  : <><Icon name="Upload" size={14} /> {form.photo_url ? 'Заменить фото' : 'Загрузить фото'}</>
                }
              </label>
              {form.photo_url && (
                <button type="button" onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                  className="text-red-500 hover:text-red-700 text-xs">Удалить</button>
              )}
            </div>
          </div>

          {[['name', 'ФИО'], ['company', 'Компания'], ['inn', 'ИНН'], ['tags', 'Теги']].map(([k, l]) => (
            <div key={k}>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">{l}</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                value={(form as unknown as Record<string, string>)[k]}
                onChange={e => setForm({ ...form, [k]: e.target.value })}
                placeholder={l}
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Заметки</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none"
              rows={3}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onSave} disabled={saving}
              className="btn-blue text-white px-4 py-2 rounded-lg text-sm font-semibold">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted">
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {contact.name && (
              <div><span className="text-xs text-muted-foreground block">ФИО</span>{contact.name}</div>
            )}
            {contact.company && (
              <div><span className="text-xs text-muted-foreground block">Компания</span>{contact.company}</div>
            )}
            {contact.inn && (
              <div><span className="text-xs text-muted-foreground block">ИНН</span>{contact.inn}</div>
            )}
            {contact.tags && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground block mb-1">Теги</span>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {contact.notes && (
              <div className="col-span-2">
                <span className="text-xs text-muted-foreground block">Заметки</span>
                <div className="text-sm whitespace-pre-wrap">{contact.notes}</div>
              </div>
            )}
          </div>
          {!contact.name && !contact.company && !contact.inn && !contact.notes && (
            <div className="text-sm text-muted-foreground">Информация не заполнена</div>
          )}
          <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-brand-blue text-sm font-semibold hover:underline mt-2">
            <Icon name="Pencil" size={13} /> Редактировать
          </button>
        </div>
      )}
    </div>
  );
}
