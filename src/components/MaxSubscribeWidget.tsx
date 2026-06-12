import { useState } from 'react';
import Icon from '@/components/ui/icon';

const SUB_URL = 'https://functions.poehali.dev/6dfb5518-6954-4ea5-972b-c20e8d06a8ab';

const CATEGORIES = [
  { value: 'office', label: 'Офисы' },
  { value: 'retail', label: 'Торговые' },
  { value: 'warehouse', label: 'Склады' },
  { value: 'restaurant', label: 'Общепит' },
  { value: 'hotel', label: 'Гостиницы' },
  { value: 'business', label: 'Готовый бизнес' },
  { value: 'gab', label: 'ГАБ' },
  { value: 'production', label: 'Производство' },
  { value: 'land', label: 'Земля' },
  { value: 'building', label: 'Здания' },
  { value: 'free_purpose', label: 'Своб. назначение' },
  { value: 'car_service', label: 'Автосервисы' },
];

type Step = 'form' | 'code' | 'done';

interface Props {
  initialCategories?: string[];
  initialDealType?: string;
  city?: string;
}

export default function MaxSubscribeWidget({ initialCategories = [], initialDealType = 'all', city = 'Краснодар' }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [phone, setPhone] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>(initialCategories);
  const [dealType, setDealType] = useState(initialDealType);
  const [code, setCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [catsText, setCatsText] = useState('');

  const toggleCat = (v: string) =>
    setSelectedCats(prev => prev.includes(v) ? prev.filter(c => c !== v) : [...prev, v]);

  const handleSubscribe = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(SUB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe',
          phone,
          categories: selectedCats,
          deal_type: dealType,
          city,
        }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setVerifyCode(d.code || '');
      setCatsText(d.categories_text || '');
      setStep('code');
    } catch {
      setError('Ошибка соединения. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(SUB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone, code }),
      });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setStep('done');
    } catch {
      setError('Ошибка. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="container mx-auto px-4 pb-6">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border-2 border-dashed border-brand-blue/30 hover:border-brand-blue/60 hover:bg-brand-blue/5 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
              <Icon name="Bell" size={16} className="text-brand-blue" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-foreground">Уведомления о новых объектах</div>
              <div className="text-xs text-muted-foreground">Первым узнавайте о новых поступлениях в MAX</div>
            </div>
          </div>
          <Icon name="ChevronRight" size={16} className="text-muted-foreground group-hover:text-brand-blue transition-colors flex-shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pb-8">
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Шапка */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-brand-blue/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-blue flex items-center justify-center">
              <Icon name="Bell" size={15} className="text-white" />
            </div>
            <div>
              <div className="font-display font-700 text-sm text-foreground">Уведомления в MAX</div>
              <div className="text-xs text-muted-foreground">Новые объекты — сразу в мессенджер</div>
            </div>
          </div>
          <button onClick={() => { setOpen(false); setStep('form'); setError(''); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <Icon name="X" size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ШАГ 1: форма */}
          {step === 'form' && (
            <>
              {/* Категории */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Категории <span className="text-brand-blue">(можно несколько)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => toggleCat(cat.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedCats.includes(cat.value)
                          ? 'bg-brand-blue text-white shadow-sm'
                          : 'bg-muted text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedCats([])}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedCats.length === 0
                        ? 'bg-brand-blue text-white shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue'
                    }`}
                  >
                    Все
                  </button>
                </div>
              </div>

              {/* Тип сделки */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тип сделки</div>
                <div className="flex gap-2">
                  {[{ v: 'all', l: 'Все' }, { v: 'sale', l: 'Продажа' }, { v: 'rent', l: 'Аренда' }].map(d => (
                    <button
                      key={d.v}
                      onClick={() => setDealType(d.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        dealType === d.v ? 'bg-brand-blue text-white' : 'bg-muted text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue'
                      }`}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Телефон */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Номер телефона</div>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+7 (999) 000-00-00"
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-brand-blue transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <Icon name="AlertCircle" size={14} />
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <Icon name="Info" size={13} className="flex-shrink-0 text-brand-blue" />
                Вам придёт код подтверждения. Найдите бота MAX по токену из настроек и введите код.
              </div>

              <button
                onClick={handleSubscribe}
                disabled={loading || !phone.trim()}
                className="w-full btn-blue text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Отправляем…</>
                ) : (
                  <><Icon name="Bell" size={15} />Подписаться</>
                )}
              </button>
            </>
          )}

          {/* ШАГ 2: ввод кода */}
          {step === 'code' && (
            <>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center mx-auto">
                  <Icon name="MessageSquare" size={22} className="text-brand-blue" />
                </div>
                <div className="font-display font-700 text-base">Подтвердите номер</div>
                <div className="text-sm text-muted-foreground">
                  Напишите боту MAX любое сообщение, затем введите код подтверждения
                </div>
              </div>

              {/* Показываем код который нужно отправить боту */}
              <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Ваш код подтверждения</div>
                <div className="font-display font-900 text-3xl tracking-[0.2em] text-brand-blue">{verifyCode}</div>
                <div className="text-xs text-muted-foreground mt-1">Введите этот код ниже после того, как напишете боту</div>
              </div>

              {catsText && (
                <div className="text-xs text-muted-foreground text-center">
                  Категории: <span className="font-medium text-foreground">{catsText}</span>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Введите код</div>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  maxLength={4}
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm text-center font-mono tracking-widest outline-none focus:border-brand-blue transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <Icon name="AlertCircle" size={14} />
                  {error}
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={loading || code.length < 4}
                className="w-full btn-blue text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Проверяем…</>
                ) : (
                  <><Icon name="Check" size={15} />Подтвердить</>
                )}
              </button>

              <button onClick={() => { setStep('form'); setError(''); }} className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">
                ← Изменить номер
              </button>
            </>
          )}

          {/* ШАГ 3: успех */}
          {step === 'done' && (
            <div className="text-center space-y-3 py-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
                <Icon name="CheckCircle2" size={26} className="text-emerald-600" />
              </div>
              <div className="font-display font-700 text-base">Подписка активирована!</div>
              <div className="text-sm text-muted-foreground">
                Будем присылать новые объекты в MAX мессенджер.
                {catsText && <> Категории: <span className="font-medium text-foreground">{catsText}</span>.</>}
              </div>
              <button
                onClick={() => { setOpen(false); setStep('form'); setPhone(''); setCode(''); setError(''); }}
                className="mt-2 px-5 py-2 rounded-xl bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                Закрыть
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
