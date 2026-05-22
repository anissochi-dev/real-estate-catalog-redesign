import { useEffect, useRef, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';
import PhonePickerInput from '@/components/admin/PhonePickerInput';
import { SOCIAL_POST_URL, getToken } from '@/lib/adminApi';
import { toast } from 'sonner';
import {
  Listing, City,
  CATS, DEALS, CONDITIONS, PURPOSE_LIST, detectVideoType,
} from './types';
import ListingEditorPriceSection from './ListingEditorPriceSection';
import ListingEditorDetailsSection from './ListingEditorDetailsSection';
import ListingEditorContentSection from './ListingEditorContentSection';
import ListingEditorExtraSection from './ListingEditorExtraSection';

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

type Tab = 'main' | 'photos' | 'location' | 'details' | 'content' | 'extra';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'main',     label: 'Основное',       icon: 'FileText' },
  { id: 'photos',   label: 'Фото',           icon: 'Image' },
  { id: 'location', label: 'Расположение',   icon: 'MapPin' },
  { id: 'details',  label: 'Характеристики', icon: 'Settings2' },
  { id: 'content',  label: 'Описание',       icon: 'AlignLeft' },
  { id: 'extra',    label: 'Дополнительное', icon: 'Layers' },
];

export default function ListingEditor({
  editing, setEditing, photos, setPhotos, cities,
  aiLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
  onDescribe, onGenerateTags, onGenerateSeo, onGenerateAll, onClose, onSave,
}: Props) {
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>('main');
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [purposeSearch, setPurposeSearch] = useState('');
  const [posting, setPosting] = useState(false);
  const purposeRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

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

  // Определяем какие вкладки имеют ошибки
  const tabErrors: Partial<Record<Tab, boolean>> = {
    main:     !!(errors.title || errors.category || errors.deal || errors.condition || errors.owner_name || errors.owner_phone),
    photos:   !!errors.photos,
    location: !!errors.address,
    details:  !!(errors.price || errors.area || errors.floor || errors.total_floors || errors.broker_commission),
    extra:    !!(errors.finishing || errors.building_class || errors.building_year || errors.property_rights),
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
    const bc = (editing as Record<string, unknown>).broker_commission as string | undefined;
    if (!bc || !bc.trim()) e.broker_commission = true;
    if (!editing.finishing) e.finishing = true;
    if (!editing.building_class) e.building_class = true;
    if (!editing.building_year) e.building_year = true;
    if (!editing.property_rights) e.property_rights = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) { onSave(); return; }
    // Переключаемся на первую вкладку с ошибкой
    const order: Tab[] = ['main', 'photos', 'location', 'details', 'extra'];
    const bc = (editing as Record<string, unknown>).broker_commission as string | undefined;
    const firstErrTab = order.find(t => {
      if (t === 'main') return !editing.title?.trim() || !editing.owner_name?.trim() || !editing.owner_phone?.trim() || !editing.category || !editing.deal || !editing.condition;
      if (t === 'photos') return !photos.length;
      if (t === 'location') return !editing.address?.trim() && !editing.district?.trim();
      if (t === 'details') return !editing.price || !editing.area || editing.floor == null || editing.total_floors == null || !bc?.trim();
      if (t === 'extra') return !editing.finishing || !editing.building_class || !editing.building_year || !editing.property_rights;
      return false;
    });
    if (firstErrTab) setTab(firstErrTab);
  };

  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const errWrap = (field: string) => errors[field] ? { 'data-field-error': 'true' as const } : {};

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div ref={formRef} className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">

        {/* Шапка */}
        <div className="p-4 border-b border-border flex justify-between items-center gap-3 flex-shrink-0">
          <div className="font-display font-700 text-lg flex items-center gap-2">
            {editing.id ? 'Редактировать' : 'Новый объект'}
            {editing.public_code ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                ID: {editing.public_code}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => setEditing({ ...editing, is_visible: !(editing.is_visible !== false) })}
              title={editing.is_visible !== false ? 'Объект виден на сайте' : 'Объект скрыт с сайта'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                editing.is_visible !== false
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}>
              <Icon name={editing.is_visible !== false ? 'Eye' : 'EyeOff'} size={13} />
              {editing.is_visible !== false ? 'Виден' : 'Скрыт'}
            </button>
            <button type="button" onClick={onGenerateAll} disabled={aiAllLoading}
              className="btn-orange text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
              <Icon name={aiAllLoading ? 'Loader2' : 'Sparkles'} size={13} className={aiAllLoading ? 'animate-spin' : ''} />
              {aiAllLoading ? 'Генерация...' : 'ИИ'}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <Icon name="X" size={20} />
            </button>
          </div>
        </div>

        {/* Вкладки */}
        <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors relative ${
                tab === t.id
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
              {tabErrors[t.id] && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 absolute top-2 right-2" />
              )}
            </button>
          ))}
        </div>

        {/* Баннер ошибок */}
        {Object.keys(errors).length > 0 && (
          <div className="px-5 pt-3 flex-shrink-0">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 flex items-center gap-2">
              <Icon name="AlertCircle" size={15} className="flex-shrink-0" />
              Заполните обязательные поля — вкладки с ошибками отмечены красной точкой
            </div>
          </div>
        )}

        {/* Контент вкладки */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* ── ОСНОВНОЕ ── */}
          {tab === 'main' && (
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
          )}

          {/* ── ФОТО ── */}
          {tab === 'photos' && (
            <div className="space-y-4">
              <div {...errWrap('photos')}>
                <label className={`text-sm font-semibold block mb-2 ${errors.photos ? 'text-red-600' : ''}`}>
                  Фотографии *{errors.photos && <span className="ml-2 text-xs font-normal text-red-500">Добавьте хотя бы одно фото</span>}
                </label>
                <ImageUploader value={photos} onChange={p => { setPhotos(p); setErrors(v => ({ ...v, photos: false })); }} folder="photos" multiple applyWatermark={!!editing.use_watermark} />
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-sm font-semibold">Метки и оформление</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editing.use_watermark}
                      onChange={e => setEditing({ ...editing, use_watermark: e.target.checked })} />
                    Использовать водяной знак
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editing.is_hot}
                      onChange={e => setEditing({ ...editing, is_hot: e.target.checked })} />
                    🔥 Горячее
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editing.is_new}
                      onChange={e => setEditing({ ...editing, is_new: e.target.checked })} />
                    Новинка
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editing.is_exclusive}
                      onChange={e => setEditing({ ...editing, is_exclusive: e.target.checked })} />
                    ⭐ Эксклюзив
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editing.is_urgent}
                      onChange={e => setEditing({ ...editing, is_urgent: e.target.checked })} />
                    ⚡ Срочно
                  </label>
                </div>
                <div className="text-xs text-muted-foreground">Эксклюзив и Срочно отображаются бейджами на фото в каталоге.</div>
              </div>

              <div className="border-t border-border pt-3">
                <label className="text-sm font-semibold block mb-1">Видео (VK Видео или RuTube URL)</label>
                <input className="w-full px-3 py-2 border rounded-lg"
                  placeholder="https://vk.com/video... или https://rutube.ru/video/..."
                  value={editing.video_url || ''}
                  onChange={e => setEditing({ ...editing, video_url: e.target.value })} />
                {editing.video_url && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Тип: {detectVideoType(editing.video_url) === 'vk' ? 'VK Видео' : detectVideoType(editing.video_url) === 'rutube' ? 'RuTube' : 'Другое'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── РАСПОЛОЖЕНИЕ ── */}
          {tab === 'location' && (
            <ListingEditorDetailsSection
              editing={editing}
              setEditing={(l) => { setEditing(l); setErrors(v => ({ ...v, address: false })); }}
              cities={cities}
              addressError={!!errors.address}
              locationOnly
            />
          )}

          {/* ── ХАРАКТЕРИСТИКИ ── */}
          {tab === 'details' && (
            <div className="space-y-1">
              <ListingEditorPriceSection editing={editing} setEditing={setEditing} errors={errors} setErrors={setErrors} />
              <ListingEditorDetailsSection
                editing={editing}
                setEditing={(l) => { setEditing(l); setErrors(v => ({ ...v, address: false })); }}
                cities={cities}
                addressError={false}
                detailsOnly
              />
            </div>
          )}

          {/* ── ОПИСАНИЕ ── */}
          {tab === 'content' && (
            <ListingEditorContentSection
              editing={editing}
              setEditing={setEditing}
              aiLoading={aiLoading}
              aiTagsLoading={aiTagsLoading}
              onDescribe={onDescribe}
              onGenerateTags={onGenerateTags}
            />
          )}

          {/* ── ДОПОЛНИТЕЛЬНОЕ ── */}
          {tab === 'extra' && (
            <ListingEditorExtraSection
              editing={editing}
              setEditing={setEditing}
              errors={errors}
              setErrors={setErrors}
              aiSeoLoading={aiSeoLoading}
              onGenerateSeo={onGenerateSeo}
            />
          )}
        </div>

        {/* Футер */}
        <div className="p-4 border-t border-border flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex gap-2">
            {editing.id && (
              <button onClick={postToSocials} disabled={posting}
                className="px-3 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2 transition">
                {posting ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Share2" size={14} />}
                В соцсети
              </button>
            )}
          </div>
          <div className="flex gap-3 items-center">
            {/* Индикатор прогресса вкладок */}
            <div className="hidden sm:flex items-center gap-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-2 h-2 rounded-full transition-colors ${tab === t.id ? 'bg-brand-blue' : tabErrors[t.id] ? 'bg-red-400' : 'bg-border'}`}
                  title={t.label}
                />
              ))}
            </div>
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