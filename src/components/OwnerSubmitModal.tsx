import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';

const OWNER_SUBMIT_URL = 'https://functions.poehali.dev/50fb474d-3de8-4007-91f4-a7d1a971a547';

const CATEGORIES = [
  { id: 'office',       label: 'Офис' },
  { id: 'retail',       label: 'Магазин / торговое' },
  { id: 'warehouse',    label: 'Склад' },
  { id: 'restaurant',   label: 'Общепит / кафе / ресторан' },
  { id: 'hotel',        label: 'Гостиница' },
  { id: 'business',     label: 'Готовый бизнес' },
  { id: 'gab',          label: 'Готовый арендный бизнес (ГАБ)' },
  { id: 'production',   label: 'Производство' },
  { id: 'land',         label: 'Земельный участок' },
  { id: 'building',     label: 'Отдельно стоящее здание' },
  { id: 'free_purpose', label: 'Помещение свободного назначения' },
  { id: 'car_service',  label: 'Автосервис' },
];

const CONDITIONS = [
  { id: 'new',      label: 'Новое' },
  { id: 'euro',     label: 'Евроремонт' },
  { id: 'good',     label: 'Хорошее' },
  { id: 'cosmetic', label: 'Требует косметики' },
  { id: 'rough',    label: 'Без отделки' },
];

const MAX_SIDE = 1920;
const JPEG_Q   = 0.82;
const MAX_FILES = 15;

async function compressToBase64(file: File): Promise<string> {
  if (file.type === 'image/gif') {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(file);
    });
  }
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const scale = Math.max(width, height) > MAX_SIDE ? MAX_SIDE / Math.max(width, height) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(width * scale);
  c.height = Math.round(height * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise(res => c.toBlob(b => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(b!);
  }, 'image/jpeg', JPEG_Q));
}

interface Props { onClose: () => void }

type Step = 1 | 2 | 3;

export default function OwnerSubmitModal({ onClose }: Props) {
  const { settings } = useSettings();
  const city = settings.main_city || 'Краснодар';

  // Шаг
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // ── Антибот ─────────────────────────────────────────────────────────────
  const [formToken, setFormToken] = useState('');
  const openedAt = useRef(Date.now());        // фиксируем время открытия формы
  const [honeypot, setHoneypot] = useState(''); // скрытое поле — бот заполнит

  // Получаем одноразовый токен при монтировании
  useEffect(() => {
    fetch(`${OWNER_SUBMIT_URL}?action=token`)
      .then(r => r.json())
      .then(d => { if (d.token) setFormToken(d.token); })
      .catch(() => {});
  }, []);

  // Шаг 1 — контакты
  const [ownerName,  setOwnerName]  = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [consent,    setConsent]    = useState(false);

  // Шаг 2 — объект
  const [deal,        setDeal]        = useState<'sale' | 'rent'>('rent');
  const [category,    setCategory]    = useState('');
  const [address,     setAddress]     = useState('');
  const [area,        setArea]        = useState('');
  const [price,       setPrice]       = useState('');
  const [description, setDescription] = useState('');
  const [showExtra,   setShowExtra]   = useState(false);
  const [floor,       setFloor]       = useState('');
  const [totalFloors, setTotalFloors] = useState('');
  const [condition,   setCondition]   = useState('');
  const [ceilHeight,  setCeilHeight]  = useState('');

  // Шаг 3 — фото
  const [photos,      setPhotos]     = useState<string[]>([]);  // base64
  const [photoNames,  setPhotoNames] = useState<string[]>([]);
  const [videoUrl,    setVideoUrl]   = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Валидация шагов
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate1 = () => {
    const e: Record<string, string> = {};
    if (!ownerName.trim())  e.ownerName  = 'Введите имя';
    if (!ownerPhone.trim()) e.ownerPhone = 'Введите телефон';
    else if (ownerPhone.replace(/\D/g, '').length < 10) e.ownerPhone = 'Некорректный номер';
    if (!consent) e.consent = 'Необходимо согласие';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validate2 = () => {
    const e: Record<string, string> = {};
    if (!category)            e.category    = 'Выберите категорию';
    if (!address.trim())      e.address     = 'Введите адрес';
    if (!area || +area <= 0)  e.area        = 'Введите площадь';
    if (!price || +price <= 0) e.price      = 'Введите стоимость';
    if (!description.trim())  e.description = 'Добавьте описание';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, MAX_FILES - photos.length);
    if (!arr.length) return;
    setPhotoLoading(true);
    const newB64: string[] = [];
    const newNames: string[] = [];
    for (const f of arr) {
      try {
        const b64 = await compressToBase64(f);
        newB64.push(b64);
        newNames.push(f.name);
      } catch { /* ignore */ }
    }
    setPhotos(p => [...p, ...newB64].slice(0, MAX_FILES));
    setPhotoNames(n => [...n, ...newNames].slice(0, MAX_FILES));
    setPhotoLoading(false);
  }, [photos.length]);

  const removePhoto = (i: number) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
    setPhotoNames(n => n.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    // Если honeypot заполнен — тихо «успех», не отправляем
    if (honeypot) { setDone(true); return; }

    setSubmitting(true);
    try {
      const fillSeconds = Math.round((Date.now() - openedAt.current) / 1000);
      const body = {
        form_token:  formToken,
        fill_time:   fillSeconds,
        website:     '',           // honeypot всегда пустой от человека
        owner_name:  ownerName.trim(),
        owner_phone: ownerPhone.trim(),
        owner_email: ownerEmail.trim() || undefined,
        deal, category,
        address: address.trim(),
        city,
        area:  parseFloat(area),
        price: parseFloat(price),
        description: description.trim(),
        floor:        floor ? parseInt(floor) : undefined,
        total_floors: totalFloors ? parseInt(totalFloors) : undefined,
        condition:    condition || undefined,
        ceiling_height: ceilHeight ? parseFloat(ceilHeight) : undefined,
        video_url:    videoUrl.trim() || undefined,
        photos: photos.map(b64 => b64.split(',')[1] || b64),
      };

      const r = await fetch(OWNER_SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || `Ошибка ${r.status}`);
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSubmitting(false);
    }
  };

  // Маска телефона
  const handlePhone = (v: string) => {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (d.startsWith('7')) {
      const p = d.slice(1);
      let f = '+7';
      if (p.length > 0) f += ' (' + p.slice(0, 3);
      if (p.length >= 3) f += ') ' + p.slice(3, 6);
      if (p.length >= 6) f += '-' + p.slice(6, 8);
      if (p.length >= 8) f += '-' + p.slice(8, 10);
      setOwnerPhone(f);
    } else {
      setOwnerPhone(v);
    }
  };

  const inputCls = (field: string) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition ${
      errors[field] ? 'border-red-400 focus:ring-red-200' : 'border-border focus:ring-brand-blue/30'
    }`;

  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* ── Шапка ── */}
        <div className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">
              {done ? 'Заявка отправлена' : 'Разместить объект'}
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
              <Icon name="X" size={18} />
            </button>
          </div>
          {!done && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                {(['О вас', 'Объект', 'Фото'] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      step > i + 1 ? 'bg-emerald-500 text-white' :
                      step === i + 1 ? 'bg-brand-blue text-white' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {step > i + 1 ? <Icon name="Check" size={10} /> : i + 1}
                    </div>
                    <span className={step === i + 1 ? 'font-semibold text-foreground' : ''}>{s}</span>
                    {i < 2 && <div className="w-6 h-px bg-border" />}
                  </div>
                ))}
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-1 bg-brand-blue rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
        </div>

        {/* ── Контент ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ══ Успех ══ */}
          {done && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <Icon name="CheckCircle2" size={36} className="text-emerald-500" />
              </div>
              <div>
                <div className="font-bold text-xl mb-2">Объект получен!</div>
                <div className="text-muted-foreground text-sm leading-relaxed">
                  Ваш объект будет рассмотрен модератором<br />
                  и опубликован в течение 24 часов.<br />
                  <br />
                  Мы свяжемся с вами по номеру<br />
                  <span className="font-semibold text-foreground">{ownerPhone}</span>
                </div>
              </div>
              <button onClick={onClose}
                className="mt-4 px-8 py-2.5 bg-brand-blue text-white rounded-xl font-semibold hover:bg-brand-blue/90 transition">
                Закрыть
              </button>
            </div>
          )}

          {/* ══ Шаг 1: О вас ══ */}
          {!done && step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-blue mb-1">
                <Icon name="User" size={16} />
                <span className="font-semibold text-sm">Ваши контакты</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Ваше имя *</label>
                <input value={ownerName} onChange={e => { setOwnerName(e.target.value); setErrors(er => ({ ...er, ownerName: '' })); }}
                  placeholder="Иван Петров" className={inputCls('ownerName')} />
                {errors.ownerName && <div className="text-xs text-red-500 mt-1">{errors.ownerName}</div>}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Телефон *</label>
                <input value={ownerPhone} onChange={e => { handlePhone(e.target.value); setErrors(er => ({ ...er, ownerPhone: '' })); }}
                  placeholder="+7 (___) ___-__-__" type="tel" className={inputCls('ownerPhone')} />
                {errors.ownerPhone && <div className="text-xs text-red-500 mt-1">{errors.ownerPhone}</div>}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Email <span className="font-normal opacity-60">(необязательно)</span></label>
                <input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                  placeholder="ivan@mail.ru" type="email" className={inputCls('ownerEmail')} />
              </div>

              {/* Honeypot — скрыто от людей, боты заполняют */}
              <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }} aria-hidden="true" tabIndex={-1}>
                <label>Website</label>
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={e => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <label className={`flex items-start gap-2.5 cursor-pointer rounded-xl p-3 border transition ${
                errors.consent ? 'border-red-300 bg-red-50' : 'border-border hover:bg-muted/30'
              }`}>
                <input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); setErrors(er => ({ ...er, consent: '' })); }}
                  className="mt-0.5 accent-brand-blue w-4 h-4 shrink-0" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Согласен на обработку персональных данных в соответствии с политикой конфиденциальности
                </span>
              </label>
              {errors.consent && <div className="text-xs text-red-500 -mt-2">{errors.consent}</div>}
            </div>
          )}

          {/* ══ Шаг 2: Объект ══ */}
          {!done && step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-blue mb-1">
                <Icon name="Building2" size={16} />
                <span className="font-semibold text-sm">Об объекте</span>
              </div>

              {/* Тип сделки */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Тип сделки *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: 'rent', label: 'Аренда', icon: 'Key' }, { id: 'sale', label: 'Продажа', icon: 'Handshake' }].map(d => (
                    <button key={d.id} type="button" onClick={() => setDeal(d.id as 'sale' | 'rent')}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-semibold text-sm transition ${
                        deal === d.id ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border hover:border-brand-blue/40'
                      }`}>
                      <Icon name={d.icon} size={15} /> {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Категория */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Категория объекта *</label>
                <select value={category} onChange={e => { setCategory(e.target.value); setErrors(er => ({ ...er, category: '' })); }}
                  className={inputCls('category')}>
                  <option value="">— выберите —</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {errors.category && <div className="text-xs text-red-500 mt-1">{errors.category}</div>}
              </div>

              {/* Адрес */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Полный адрес *</label>
                <input value={address} onChange={e => { setAddress(e.target.value); setErrors(er => ({ ...er, address: '' })); }}
                  placeholder={`ул. Красная, 1, ${city}`} className={inputCls('address')} />
                {errors.address && <div className="text-xs text-red-500 mt-1">{errors.address}</div>}
              </div>

              {/* Площадь + Цена */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Площадь, м² *</label>
                  <input value={area} onChange={e => { setArea(e.target.value); setErrors(er => ({ ...er, area: '' })); }}
                    type="number" min="1" placeholder="100" className={inputCls('area')} />
                  {errors.area && <div className="text-xs text-red-500 mt-1">{errors.area}</div>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {deal === 'rent' ? 'Аренда, ₽/мес *' : 'Цена, ₽ *'}
                  </label>
                  <input value={price} onChange={e => { setPrice(e.target.value); setErrors(er => ({ ...er, price: '' })); }}
                    type="number" min="1" placeholder="150000" className={inputCls('price')} />
                  {errors.price && <div className="text-xs text-red-500 mt-1">{errors.price}</div>}
                </div>
              </div>

              {/* Описание */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Описание *</label>
                <textarea value={description} onChange={e => { setDescription(e.target.value); setErrors(er => ({ ...er, description: '' })); }}
                  rows={4} placeholder="Расскажите об объекте: состояние, особенности, что рядом..."
                  className={`${inputCls('description')} resize-none`} />
                {errors.description && <div className="text-xs text-red-500 mt-1">{errors.description}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5 text-right">{description.length}/3000</div>
              </div>

              {/* Дополнительно */}
              <button type="button" onClick={() => setShowExtra(v => !v)}
                className="flex items-center gap-2 text-sm text-brand-blue hover:underline">
                <Icon name={showExtra ? 'ChevronUp' : 'ChevronDown'} size={14} />
                Дополнительные характеристики {showExtra ? '' : '(необязательно)'}
              </button>

              {showExtra && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Этаж</label>
                    <input value={floor} onChange={e => setFloor(e.target.value)} type="number" min="1"
                      placeholder="2" className={inputCls('floor')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Этажей в здании</label>
                    <input value={totalFloors} onChange={e => setTotalFloors(e.target.value)} type="number" min="1"
                      placeholder="5" className={inputCls('totalFloors')} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Состояние</label>
                    <select value={condition} onChange={e => setCondition(e.target.value)} className={inputCls('condition')}>
                      <option value="">— не указано —</option>
                      {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Высота потолков, м</label>
                    <input value={ceilHeight} onChange={e => setCeilHeight(e.target.value)} type="number" min="1" step="0.1"
                      placeholder="3.2" className={inputCls('ceilHeight')} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ Шаг 3: Фото ══ */}
          {!done && step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand-blue mb-1">
                <Icon name="Camera" size={16} />
                <span className="font-semibold text-sm">Фотографии объекта</span>
              </div>

              {/* Зона загрузки */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl py-6 px-4 text-center transition ${
                  dragOver ? 'border-brand-blue bg-brand-blue/5' : 'border-border hover:border-brand-blue/50 bg-muted/20'
                }`}
              >
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => e.target.files && handleFiles(e.target.files)} />
                <Icon name={photoLoading ? 'Loader2' : 'Upload'} size={28}
                  className={`mx-auto mb-2 text-brand-blue ${photoLoading ? 'animate-spin' : ''}`} />
                <div className="font-semibold text-sm">
                  {photoLoading ? 'Обработка фото…' : 'Нажмите или перетащите фото'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  До {MAX_FILES} фото, JPG/PNG/WEBP · Сжимаются автоматически
                </div>
              </div>

              {/* Превью фото */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((b64, i) => (
                    <div key={i} className="relative group rounded-xl overflow-hidden border border-border aspect-square">
                      <img src={b64} alt="" className="w-full h-full object-cover" />
                      {i === 0 && (
                        <div className="absolute top-1 left-1 text-[9px] bg-brand-blue text-white px-1.5 py-0.5 rounded-full font-bold">
                          Главное
                        </div>
                      )}
                      <button type="button" onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow">
                        <Icon name="X" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Видео */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Ссылка на видео <span className="font-normal opacity-60">(необязательно)</span>
                </label>
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://vk.com/video... или https://rutube.ru/video/..."
                  className={inputCls('videoUrl')} />
              </div>

              {/* Итоговая подсказка */}
              <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <Icon name="ShieldCheck" size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 leading-relaxed">
                  Объект будет проверен модератором и опубликован в течение 24 часов.
                  После публикации мы свяжемся с вами.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Кнопки ── */}
        {!done && (
          <div className="px-5 py-4 border-t border-border shrink-0 flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(s => (s - 1) as Step)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition">
                <Icon name="ChevronLeft" size={15} /> Назад
              </button>
            )}
            <button
              onClick={() => {
                if (step === 1) { if (validate1()) setStep(2); }
                else if (step === 2) { if (validate2()) setStep(3); }
                else handleSubmit();
              }}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-blue text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-blue/90 transition disabled:opacity-60"
            >
              {submitting
                ? <><Icon name="Loader2" size={15} className="animate-spin" /> Отправляем…</>
                : step < 3
                ? <><span>Далее</span> <Icon name="ChevronRight" size={15} /></>
                : <><Icon name="Send" size={15} /> Отправить заявку</>
              }
            </button>
          </div>
        )}

      </div>
    </div>
  );
}