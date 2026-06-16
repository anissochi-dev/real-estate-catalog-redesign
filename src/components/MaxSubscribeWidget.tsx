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
  /** Если true — рендерит только модал без триггер-кнопки (управляется снаружи) */
  open?: boolean;
  onClose?: () => void;
}

export default function MaxSubscribeWidget({
  initialCategories = [],
  initialDealType = 'all',
  city = 'Краснодар',
  open: externalOpen,
  onClose: externalClose,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const close = () => {
    if (isControlled) { externalClose?.(); } else { setInternalOpen(false); }
    setStep('form');
    setError('');
  };

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
        body: JSON.stringify({ action: 'subscribe', phone, categories: selectedCats, deal_type: dealType, city }),
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

  return (
    <>
      {/* Триггер-кнопка — показывается только если не управляется снаружи */}
      {!isControlled && (
        <div className="container mx-auto px-4 pb-6">
          <button
            onClick={() => setInternalOpen(true)}
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
      )}

      {/* Модальное окно */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Оверлей */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />

          {/* Диалог */}
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Шапка */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-brand-blue to-brand-blue/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Icon name="Bell" size={18} className="text-white" />
                </div>
                <div>
                  <div className="font-display font-700 text-base text-white">Уведомления в MAX</div>
                  <div className="text-xs text-white/70">Новые объекты — сразу в мессенджер</div>
                </div>
              </div>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                <Icon name="X" size={18} className="text-white" />
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
                      onKeyDown={e => e.key === 'Enter' && phone.trim() && handleSubscribe()}
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
                    className="w-full btn-blue text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading
                      ? <><Icon name="Loader2" size={16} className="animate-spin" /> Подключаю...</>
                      : <><Icon name="Bell" size={16} /> Подписаться</>}
                  </button>
                </>
              )}

              {/* ШАГ 2: код */}
              {step === 'code' && (
                <>
                  <div className="text-center py-2">
                    <div className="w-14 h-14 rounded-2xl bg-brand-blue/10 flex items-center justify-center mx-auto mb-3">
                      <Icon name="MessageSquare" size={26} className="text-brand-blue" />
                    </div>
                    <div className="font-semibold text-base mb-1">Подтвердите номер</div>
                    <div className="text-sm text-muted-foreground">
                      Введите код из бота MAX на номер <span className="font-medium text-foreground">{phone}</span>
                    </div>
                    {verifyCode && (
                      <div className="mt-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
                        Токен для бота: <span className="font-mono font-semibold text-foreground">{verifyCode}</span>
                      </div>
                    )}
                    {catsText && (
                      <div className="mt-1.5 text-xs text-brand-blue bg-brand-blue/5 rounded-lg px-3 py-1.5">{catsText}</div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && code.trim() && handleVerify()}
                    placeholder="Код подтверждения"
                    className="w-full px-3 py-2.5 border border-border rounded-xl text-sm text-center font-mono tracking-widest outline-none focus:border-brand-blue"
                    autoFocus
                  />

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      <Icon name="AlertCircle" size={14} />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleVerify}
                    disabled={loading || !code.trim()}
                    className="w-full btn-blue text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading
                      ? <><Icon name="Loader2" size={16} className="animate-spin" /> Проверяю...</>
                      : <><Icon name="CheckCircle" size={16} /> Подтвердить</>}
                  </button>

                  <button onClick={() => { setStep('form'); setCode(''); setError(''); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                    ← Назад
                  </button>
                </>
              )}

              {/* ШАГ 3: успех */}
              {step === 'done' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <Icon name="CheckCircle2" size={30} className="text-emerald-600" />
                  </div>
                  <div className="font-display font-700 text-lg mb-1">Подписка оформлена!</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    Новые объекты будут приходить в MAX на ваш номер.
                  </div>
                  <button onClick={close}
                    className="btn-blue text-white px-8 py-2.5 rounded-xl font-semibold text-sm">
                    Закрыть
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}