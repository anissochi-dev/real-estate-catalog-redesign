import { useEffect, useRef, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';
import PhonePickerInput from '@/components/admin/PhonePickerInput';
import { SOCIAL_POST_URL, getToken } from '@/lib/adminApi';
import { toast } from 'sonner';
import {
  Listing, City, Purpose,
  CATS, DEALS, CONDITIONS, PURPOSE_LIST,
} from './types';
import ListingEditorPriceSection from './ListingEditorPriceSection';
import ListingEditorDetailsSection from './ListingEditorDetailsSection';
import ListingEditorContentSection from './ListingEditorContentSection';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  photos: string[];
  setPhotos: (p: string[]) => void;
  cities: City[];
  aiLoading: boolean;
  aiTagsLoading: boolean;
  aiSeoLoading: boolean;
  aiAllLoading: boolean;
  onDescribe: () => void;
  onGenerateTags: () => void;
  onGenerateSeo: () => void;
  onGenerateAll: () => void;
  onClose: () => void;
  onSave: () => void;
}

export default function ListingEditor({
  editing, setEditing, photos, setPhotos, cities,
  aiLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
  onDescribe, onGenerateTags, onGenerateSeo, onGenerateAll, onClose, onSave,
}: Props) {
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [purposeSearch, setPurposeSearch] = useState('');
  const [posting, setPosting] = useState(false);
  const purposeRef = useRef<HTMLDivElement>(null);

  const postToSocials = async () => {
    if (!editing.id) return;
    setPosting(true);
    try {
      const r = await fetch(SOCIAL_POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify({ action: 'post', entity_type: 'listing', entity_id: editing.id }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      const results: { platform: string; label: string; ok?: boolean; manual?: boolean; error?: string }[] = d.results || [];
      const ok = results.filter(r => r.ok).length;
      const manual = results.filter(r => r.manual).length;
      const fail = results.filter(r => r.error).length;
      if (ok > 0 || manual > 0) toast.success(`Опубликовано: ${ok} авто, ${manual} для ручной публикации${fail > 0 ? `, ошибок: ${fail}` : ''}`);
      else if (fail > 0) toast.error(`Ошибки публикации: ${fail}`);
      else toast.info('Нет включённых платформ с автопостингом для объектов');
    } finally {
      setPosting(false);
    }
  };

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

  const MAX_PURPOSES = 10;

  const togglePurpose = (name: string) => {
    if (!selectedPurposes.includes(name) && selectedPurposes.length >= MAX_PURPOSES) return;
    const cur = selectedPurposes.includes(name)
      ? selectedPurposes.filter(p => p !== name)
      : [...selectedPurposes, name];
    setEditing({ ...editing, purpose: cur.join('|') });
  };

  const validate = (): boolean => {
    const e: Record<string, boolean> = {};
    if (!editing.title?.trim()) e.title = true;
    if (!editing.owner_phone?.trim()) e.owner_phone = true;
    if (!editing.owner_name?.trim()) e.owner_name = true;
    if (!photos.length) e.photos = true;
    if (!editing.category) e.category = true;
    if (!editing.deal) e.deal = true;
    if (!editing.condition) e.condition = true;
    if (!editing.price) e.price = true;
    if (!editing.area) e.area = true;
    if (editing.floor == null) e.floor = true;
    if (editing.total_floors == null) e.total_floors = true;
    if (!editing.address?.trim() && !editing.district?.trim()) e.address = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) onSave();
  };

  const err = (field: string) => errors[field]
    ? 'border-red-400 bg-red-50'
    : '';

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white z-10 gap-3">
          <div className="font-display font-700 text-lg flex items-center gap-2">
            {editing.id ? 'Редактировать' : 'Новый объект'}
            {editing.public_code ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                ID: {editing.public_code}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setEditing({ ...editing, is_visible: !(editing.is_visible !== false) })}
              title={editing.is_visible !== false ? 'Объект виден на сайте' : 'Объект скрыт с сайта'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                editing.is_visible !== false
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}>
              <Icon name={editing.is_visible !== false ? 'Eye' : 'EyeOff'} size={13} />
              {editing.is_visible !== false ? 'Виден на сайте' : 'Скрыт с сайта'}
            </button>
            <button type="button" onClick={onGenerateAll} disabled={aiAllLoading}
              title="Сгенерировать описание, теги и SEO одним кликом"
              className="btn-orange text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
              <Icon name={aiAllLoading ? 'Loader2' : 'Sparkles'} size={13} className={aiAllLoading ? 'animate-spin' : ''} />
              {aiAllLoading ? 'Генерация...' : 'Сгенерировать всё'}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <Icon name="X" size={20} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <Icon name="AlertCircle" size={16} className="mt-0.5 flex-shrink-0" />
              Заполните все обязательные поля, выделенные красным.
            </div>
          )}

          {/* 1. Название */}
          <div className="space-y-1.5">
            <div className="relative">
              <input className={`w-full px-3 py-2 border rounded-lg pr-16 ${err('title')}`} placeholder="Название объекта *"
                maxLength={120}
                value={editing.title || ''}
                onChange={e => { setEditing({ ...editing, title: e.target.value }); setErrors(v => ({ ...v, title: false })); }} />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
                (editing.title?.length || 0) >= 110 ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                {editing.title?.length || 0}/120
              </span>
            </div>
            {/* Автодобавление типа сделки */}
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
                  <span>+ Добавить в начало: «{suggestion}»</span>
                </button>
              );
            })()}
          </div>

          {/* 2. Собственник */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-4">
            <div>
              <label className="text-xs text-muted-foreground">Имя собственника *</label>
              <input className={`w-full px-3 py-2 border rounded-lg ${err('owner_name')}`}
                value={editing.owner_name || ''}
                onChange={e => { setEditing({ ...editing, owner_name: e.target.value }); setErrors(v => ({ ...v, owner_name: false })); }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Телефон собственника *</label>
              <PhonePickerInput
                value={editing.owner_phone || ''}
                onChange={(phone, name) => { setEditing({ ...editing, owner_phone: phone, ...(name && !editing.owner_name ? { owner_name: name } : {}) }); setErrors(v => ({ ...v, owner_phone: false })); }}
                onNameChange={name => { if (!editing.owner_name) setEditing({ ...editing, owner_name: name }); }}
              />
            </div>
            <div className="sm:col-start-2">
              <label className="text-xs text-muted-foreground">
                Дополнительный телефон
              </label>
              <PhonePickerInput
                value={(editing as Record<string, unknown>).owner_phone2 as string || ''}
                onChange={phone => setEditing({ ...editing, owner_phone2: phone } as typeof editing)}
              />
            </div>
          </div>

          {/* 3. Фотографии */}
          <div className="border-t border-border pt-4">
            <label className={`text-sm font-semibold block mb-1 ${errors.photos ? 'text-red-600' : ''}`}>
              Фотографии *{errors.photos && <span className="ml-2 text-xs font-normal text-red-500">Добавьте хотя бы одно фото</span>}
            </label>
            <ImageUploader value={photos} onChange={p => { setPhotos(p); setErrors(v => ({ ...v, photos: false })); }} folder="photos" multiple applyWatermark={!!editing.use_watermark} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Категория *</label>
              <select className={`w-full px-3 py-2 border rounded-lg ${err('category')}`} value={editing.category}
                onChange={e => { setEditing({ ...editing, category: e.target.value }); setErrors(v => ({ ...v, category: false })); }}>
                {CATS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Тип сделки *</label>
              <select className={`w-full px-3 py-2 border rounded-lg ${err('deal')}`} value={editing.deal}
                onChange={e => { setEditing({ ...editing, deal: e.target.value }); setErrors(v => ({ ...v, deal: false })); }}>
                {DEALS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">
                Назначение (можно выбрать несколько, максимум {MAX_PURPOSES})
                {selectedPurposes.length >= MAX_PURPOSES && (
                  <span className="ml-2 text-amber-600 font-medium">— достигнут лимит</span>
                )}
              </label>
              <div className="relative" ref={purposeRef}>
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <Icon name="Search" size={14} className="ml-3 text-muted-foreground flex-shrink-0" />
                  <input
                    value={purposeSearch}
                    onChange={e => { setPurposeSearch(e.target.value); setPurposeOpen(true); }}
                    onFocus={() => setPurposeOpen(true)}
                    placeholder="Поиск назначения..."
                    className="flex-1 px-2 py-2 text-sm outline-none"
                  />
                  {selectedPurposes.length > 0 && (
                    <span className="mr-2 text-xs bg-brand-blue text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {selectedPurposes.length}
                    </span>
                  )}
                </div>
                {purposeOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {PURPOSE_LIST
                      .filter(name => !purposeSearch || name.toLowerCase().includes(purposeSearch.toLowerCase()))
                      .map(name => {
                        const isChecked = selectedPurposes.includes(name);
                        const isDisabled = !isChecked && selectedPurposes.length >= MAX_PURPOSES;
                        return (
                          <label key={name} className={`flex items-center gap-2 px-3 py-2 text-sm ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePurpose(name)}
                              disabled={isDisabled}
                              className="accent-brand-blue"
                            />
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
            <div>
              <label className="text-xs text-muted-foreground">Состояние *</label>
              <select className={`w-full px-3 py-2 border rounded-lg ${err('condition')}`} value={editing.condition || ''}
                onChange={e => { setEditing({ ...editing, condition: e.target.value }); setErrors(v => ({ ...v, condition: false })); }}>
                <option value="">— Не выбрано —</option>
                {CONDITIONS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
          </div>

          <ListingEditorPriceSection editing={editing} setEditing={setEditing} errors={errors} setErrors={setErrors} />

          <ListingEditorDetailsSection editing={editing} setEditing={(l) => { setEditing(l); setErrors(v => ({ ...v, address: false })); }} cities={cities} />
          {errors.address && (
            <div className="text-xs text-red-600 flex items-center gap-1.5 -mt-2">
              <Icon name="AlertCircle" size={13} />
              Укажите расположение объекта (адрес или район) *
            </div>
          )}

          <ListingEditorContentSection
            editing={editing}
            setEditing={setEditing}
            aiLoading={aiLoading}
            aiTagsLoading={aiTagsLoading}
            aiSeoLoading={aiSeoLoading}
            onDescribe={onDescribe}
            onGenerateTags={onGenerateTags}
            onGenerateSeo={onGenerateSeo}
          />
        </div>

        <div className="p-5 border-t border-border flex items-center justify-between gap-3 sticky bottom-0 bg-white">
          <div>
            {editing.id && (
              <button onClick={postToSocials} disabled={posting}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2 transition">
                {posting ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Share2" size={14} />}
                Опубликовать в соцсети
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
            <button onClick={handleSave} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}