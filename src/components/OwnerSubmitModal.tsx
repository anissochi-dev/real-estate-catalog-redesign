import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import { extractDigits } from '@/lib/phone';
import OwnerSubmitStepContact from './OwnerSubmitStepContact';
import OwnerSubmitStepObject from './OwnerSubmitStepObject';
import OwnerSubmitStepPhotos from './OwnerSubmitStepPhotos';

const OWNER_SUBMIT_URL = 'https://functions.poehali.dev/50fb474d-3de8-4007-91f4-a7d1a971a547';

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
  const openedAt = useRef(Date.now());
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    fetch(`${OWNER_SUBMIT_URL}?action=token`)
      .then(r => r.json())
      .then(d => { if (d.token) setFormToken(d.token); })
      .catch(() => {});
  }, []);

  // Шаг 1 — контакты
  const [ownerName,    setOwnerName]    = useState('');
  const [ownerPhone,   setOwnerPhone]   = useState('');
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [ownerEmail,   setOwnerEmail]   = useState('');
  const [consent,      setConsent]      = useState(false);

  // Шаг 2 — объект
  const [deal,          setDeal]          = useState<'sale' | 'rent'>('rent');
  const [category,      setCategory]      = useState('');
  const [address,       setAddress]       = useState('');
  const [area,          setArea]          = useState('');
  const [price,         setPrice]         = useState('');
  const [description,   setDescription]   = useState('');
  const [condition,     setCondition]     = useState('');
  // utilities — Record<key, value>, e.g. { 'Вода': 'Центральная' }
  // сериализуется в строку "Вода: Центральная, Газ: Магистральный" — точно как в редакторе
  const [utilities,     setUtilities]     = useState<Record<string, string>>({});
  const [electricityKw, setElectricityKw] = useState('');
  const [showExtra,     setShowExtra]     = useState(false);
  const [floor,         setFloor]         = useState('');
  const [totalFloors,   setTotalFloors]   = useState('');
  const [ceilHeight,    setCeilHeight]    = useState('');

  const setUtilityValue = (key: string, value: string) =>
    setUtilities(prev => value ? { ...prev, [key]: value } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));

  // Шаг 3 — фото
  const [photos,       setPhotos]       = useState<string[]>([]);
  const [photoNames,   setPhotoNames]   = useState<string[]>([]);
  const [videoUrl,     setVideoUrl]     = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);

  // Валидация шагов
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate1 = () => {
    const e: Record<string, string> = {};
    if (!ownerName.trim())  e.ownerName  = 'Введите имя';
    if (!ownerPhone.trim()) e.ownerPhone = 'Введите телефон';
    else if (extractDigits(ownerPhone).length < 10) e.ownerPhone = 'Введите полный номер (10 цифр)';
    if (!consent) e.consent = 'Необходимо согласие';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validate2 = () => {
    const e: Record<string, string> = {};
    if (!category)                             e.category      = 'Выберите категорию';
    if (!address.trim())                       e.address       = 'Введите адрес';
    if (!area || +area <= 0)                   e.area          = 'Введите площадь';
    if (!price || +price <= 0)                 e.price         = 'Введите стоимость';
    if (!description.trim())                   e.description   = 'Добавьте описание';
    if (!condition)                            e.condition     = 'Укажите состояние объекта';
    if (Object.keys(utilities).length === 0)   e.utilities     = 'Укажите хотя бы одну коммуникацию';
    if (!electricityKw || +electricityKw <= 0) e.electricityKw = 'Укажите электрическую мощность';
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
    if (honeypot) { setDone(true); return; }

    setSubmitting(true);
    try {
      const fillSeconds = Math.round((Date.now() - openedAt.current) / 1000);
      const body = {
        form_token:     formToken,
        fill_time:      fillSeconds,
        website:        '',
        owner_name:     ownerName.trim(),
        owner_phone:    ownerPhone.trim(),
        owner_email:    ownerEmail.trim() || undefined,
        deal, category,
        address:        address.trim(),
        city,
        area:           parseFloat(area),
        price:          parseFloat(price),
        description:    description.trim(),
        floor:          floor ? parseInt(floor) : undefined,
        total_floors:   totalFloors ? parseInt(totalFloors) : undefined,
        condition:      condition || undefined,
        // Сериализуем в формат "Ключ: Значение, ..." — точно как хранит редактор объекта
        utilities:      Object.keys(utilities).length
          ? Object.entries(utilities).map(([k, v]) => `${k}: ${v}`).join(', ')
          : undefined,
        electricity_kw: electricityKw ? parseFloat(electricityKw) : undefined,
        ceiling_height: ceilHeight ? parseFloat(ceilHeight) : undefined,
        video_url:      videoUrl.trim() || undefined,
        photos:         photos.map(b64 => b64.split(',')[1] || b64),
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
            <OwnerSubmitStepContact
              ownerName={ownerName} setOwnerName={setOwnerName}
              ownerPhone={ownerPhone} setOwnerPhone={setOwnerPhone}
              phoneDisplay={phoneDisplay} setPhoneDisplay={setPhoneDisplay}
              ownerEmail={ownerEmail} setOwnerEmail={setOwnerEmail}
              honeypot={honeypot} setHoneypot={setHoneypot}
              consent={consent} setConsent={setConsent}
              errors={errors} setErrors={setErrors}
              inputCls={inputCls}
            />
          )}

          {/* ══ Шаг 2: Объект ══ */}
          {!done && step === 2 && (
            <OwnerSubmitStepObject
              city={city}
              deal={deal} setDeal={setDeal}
              category={category} setCategory={setCategory}
              address={address} setAddress={setAddress}
              area={area} setArea={setArea}
              price={price} setPrice={setPrice}
              condition={condition} setCondition={setCondition}
              utilities={utilities} setUtilityValue={setUtilityValue}
              electricityKw={electricityKw} setElectricityKw={setElectricityKw}
              description={description} setDescription={setDescription}
              showExtra={showExtra} setShowExtra={setShowExtra}
              floor={floor} setFloor={setFloor}
              totalFloors={totalFloors} setTotalFloors={setTotalFloors}
              ceilHeight={ceilHeight} setCeilHeight={setCeilHeight}
              errors={errors} setErrors={setErrors}
              inputCls={inputCls}
            />
          )}

          {/* ══ Шаг 3: Фото ══ */}
          {!done && step === 3 && (
            <OwnerSubmitStepPhotos
              photos={photos}
              photoLoading={photoLoading}
              videoUrl={videoUrl} setVideoUrl={setVideoUrl}
              onFiles={handleFiles}
              onRemovePhoto={removePhoto}
              inputCls={inputCls}
            />
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