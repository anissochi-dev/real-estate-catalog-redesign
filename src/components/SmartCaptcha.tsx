/**
 * SmartCaptcha — умная CAPTCHA без сторонних сервисов.
 * Анализирует поведение пользователя: движения мыши, задержки между нажатиями,
 * скорость заполнения формы, тач-события. Боты заполняют форму мгновенно и
 * без хаотичного поведения. При низком score — показывает задачу для человека.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

export interface CaptchaResult {
  token: string;    // передаётся на бэкенд для верификации
  score: number;    // 0..1, чем выше — тем вероятнее человек
  passed: boolean;
}

interface Props {
  onVerify: (result: CaptchaResult) => void;
  onReset?: () => void;
  fieldCount?: number; // кол-во полей в форме (для нормализации времени)
}

// Простая задача для человека если score низкий
const CHALLENGES = [
  { q: 'Сколько будет 3 + 5?', a: '8' },
  { q: 'Напишите слово «офис»', a: 'офис' },
  { q: 'Первая буква слова «аренда»?', a: 'а' },
  { q: 'Сколько месяцев в году?', a: '12' },
  { q: 'Напишите «да» по-русски', a: 'да' },
];

function generateToken(score: number): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const scoreHex = Math.round(score * 100).toString(16).padStart(2, '0');
  return `sc_${ts}_${rand}_${scoreHex}`;
}

export default function SmartCaptcha({ onVerify, fieldCount = 3 }: Props) {
  // Сигналы поведения
  const startTimeRef = useRef<number>(Date.now());
  const mouseMoveCountRef = useRef(0);
  const keyPressCountRef = useRef(0);
  const focusChangesRef = useRef(0);
  const touchEventsRef = useRef(0);
  const lastKeyTimeRef = useRef<number>(0);
  const keyIntervalSumRef = useRef(0);
  const keyIntervalCountRef = useRef(0);

  const [verified, setVerified] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [challenge] = useState(() => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Навешиваем глобальные обработчики на документ, чтобы собирать сигналы
  useEffect(() => {
    startTimeRef.current = Date.now();

    const onMove = () => { mouseMoveCountRef.current++; };
    const onKey = () => {
      keyPressCountRef.current++;
      const now = Date.now();
      if (lastKeyTimeRef.current > 0) {
        keyIntervalSumRef.current += now - lastKeyTimeRef.current;
        keyIntervalCountRef.current++;
      }
      lastKeyTimeRef.current = now;
    };
    const onFocus = () => { focusChangesRef.current++; };
    const onTouch = () => { touchEventsRef.current++; };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('keydown', onKey, { passive: true });
    document.addEventListener('focusin', onFocus, { passive: true });
    document.addEventListener('touchstart', onTouch, { passive: true });

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('touchstart', onTouch);
    };
  }, []);

  const computeScore = useCallback((): number => {
    const elapsed = (Date.now() - startTimeRef.current) / 1000; // секунды
    const moves = mouseMoveCountRef.current;
    const keys = keyPressCountRef.current;
    const focuses = focusChangesRef.current;
    const touches = touchEventsRef.current;
    const avgKeyInterval = keyIntervalCountRef.current > 0
      ? keyIntervalSumRef.current / keyIntervalCountRef.current
      : 0;

    let score = 0;

    // 1. Время заполнения: бот заполняет за <2с, человек обычно >5с
    const minExpectedTime = fieldCount * 2; // минимум 2с на поле
    if (elapsed >= minExpectedTime * 3) score += 0.30;
    else if (elapsed >= minExpectedTime) score += 0.15;
    else if (elapsed < 1) score -= 0.20; // мгновенно = бот

    // 2. Движения мыши (на мобайле — тач-события)
    const isMobile = touches > 0;
    if (isMobile) {
      score += touches >= 3 ? 0.25 : 0.10;
    } else {
      if (moves >= 50) score += 0.25;
      else if (moves >= 15) score += 0.15;
      else if (moves === 0) score -= 0.15;
    }

    // 3. Нажатия клавиш с нормальным интервалом (человек: 100–500ms)
    if (keys >= fieldCount * 3) score += 0.20;
    if (avgKeyInterval >= 80 && avgKeyInterval <= 600) score += 0.15;
    else if (avgKeyInterval > 0 && avgKeyInterval < 50) score -= 0.15; // очень быстро = бот

    // 4. Смена фокуса между полями
    if (focuses >= fieldCount) score += 0.10;

    return Math.max(0, Math.min(1, score));
  }, [fieldCount]);

  const verify = useCallback(() => {
    const score = computeScore();
    if (score >= 0.45) {
      // Высокий score — явно человек
      const token = generateToken(score);
      setVerified(true);
      onVerify({ token, score, passed: true });
    } else {
      // Низкий score — показываем задачку
      setShowChallenge(true);
    }
  }, [computeScore, onVerify]);

  const submitChallenge = () => {
    setChecking(true);
    setError('');
    const userAnswer = answer.trim().toLowerCase();
    const correct = challenge.a.toLowerCase();
    setTimeout(() => {
      if (userAnswer === correct) {
        const score = 0.75; // человек прошёл задачку
        const token = generateToken(score);
        setVerified(true);
        setShowChallenge(false);
        onVerify({ token, score, passed: true });
      } else {
        setError('Неверный ответ. Попробуйте ещё раз.');
        setAnswer('');
      }
      setChecking(false);
    }, 400);
  };

  if (verified) {
    return (
      <div className="flex items-center gap-2 text-emerald-700 text-sm">
        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
          <Icon name="Check" size={13} className="text-white" />
        </div>
        Проверка пройдена
      </div>
    );
  }

  if (showChallenge) {
    return (
      <div className="border border-border rounded-xl p-4 bg-muted/30 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="ShieldCheck" size={16} className="text-brand-blue" />
          Подтвердите, что вы человек
        </div>
        <div className="text-sm text-foreground">{challenge.q}</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitChallenge()}
            placeholder="Ваш ответ..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-blue"
            autoFocus
          />
          <button
            onClick={submitChallenge}
            disabled={checking || !answer.trim()}
            className="px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {checking ? <Icon name="Loader2" size={15} className="animate-spin" /> : 'OK'}
          </button>
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={verify}
      className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-xl bg-white hover:bg-muted/30 transition text-left"
    >
      <div className="w-5 h-5 border-2 border-border rounded shrink-0" />
      <span className="text-sm text-foreground">Я не робот</span>
      <div className="ml-auto flex flex-col items-end">
        <div className="text-[10px] text-muted-foreground font-semibold">CAPTCHA</div>
        <div className="text-[9px] text-muted-foreground">SmartCheck</div>
      </div>
    </button>
  );
}

/**
 * Хук для интеграции SmartCaptcha в форму.
 * Возвращает captchaResult и компонент для рендера.
 */
export function useSmartCaptcha(fieldCount = 3) {
  const [captchaResult, setCaptchaResult] = useState<CaptchaResult | null>(null);
  const [key, setKey] = useState(0);

  const reset = () => {
    setCaptchaResult(null);
    setKey(k => k + 1);
  };

  const CaptchaComponent = (
    <SmartCaptcha
      key={key}
      fieldCount={fieldCount}
      onVerify={setCaptchaResult}
      onReset={reset}
    />
  );

  return { captchaResult, CaptchaComponent, reset, isPassed: captchaResult?.passed === true };
}
