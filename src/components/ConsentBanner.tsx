import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';

const CONSENT_KEY = 'biznest_consent_v1';

export function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
}

export function revokeConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // ignore
  }
}

interface Props {
  onAccept: () => void;
}

export default function ConsentBanner({ onAccept }: Props) {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted');
    } catch {
      // ignore
    }
    onAccept();
  };

  const handleDecline = () => {
    navigate('/declined');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[80vh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center shrink-0">
              <Icon name="ShieldCheck" size={20} className="text-brand-blue" />
            </div>
            <div>
              <h2 className="font-display font-800 text-lg text-foreground leading-tight">Прежде чем продолжить</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Для работы сайта нам нужно ваше согласие</p>
            </div>
          </div>

          <p className="text-sm text-foreground/80 leading-relaxed">
            Используя этот сайт, вы соглашаетесь с нашей{' '}
            <strong>Политикой конфиденциальности</strong>, <strong>Пользовательским соглашением</strong>{' '}
            и даёте согласие на использование <strong>файлов cookie</strong> для корректной работы сервиса.
          </p>

          <button
            onClick={() => setDetailsOpen(v => !v)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
          >
            <Icon name={detailsOpen ? 'ChevronUp' : 'ChevronDown'} size={14} />
            {detailsOpen ? 'Скрыть подробности' : 'Подробнее о данных'}
          </button>
        </div>

        {/* Details */}
        {detailsOpen && (
          <div className="px-5 pb-4 overflow-y-auto shrink-0">
            <div className="bg-muted/40 rounded-xl p-4 space-y-3 text-sm text-foreground/75">
              <div className="flex gap-3">
                <Icon name="Cookie" size={16} className="text-brand-blue shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-foreground mb-0.5">Файлы cookie</div>
                  <p>Используются для сохранения настроек, аналитики и корректной работы форм.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Icon name="User" size={16} className="text-brand-blue shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-foreground mb-0.5">Персональные данные</div>
                  <p>Данные из форм обратной связи (имя, телефон) используются для связи с вами.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Icon name="BarChart2" size={16} className="text-brand-blue shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-foreground mb-0.5">Аналитика</div>
                  <p>Яндекс.Метрика и Google Analytics помогают нам улучшать сайт. Данные обезличены.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-5 pt-2 shrink-0 flex flex-col sm:flex-row gap-2 border-t border-border mt-auto">
          <button
            onClick={handleAccept}
            className="flex-1 btn-blue text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Icon name="Check" size={16} />
            Принять и продолжить
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 sm:flex-none sm:px-5 py-3 rounded-xl font-semibold text-sm border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="X" size={16} />
            Отказаться
          </button>
        </div>
      </div>
    </div>
  );
}
