import { useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';

const CONSENT_KEY = 'biznest_consent_v1';
const CONSENT_ID_KEY = 'biznest_consent_id';
const CONSENT_SESSION_KEY = 'biznest_consent_session';
// Ключ: дата последней серверной проверки (чтобы не дёргать сервер при каждом визите)
const CONSENT_SERVER_CHECK_KEY = 'biznest_consent_server_checked';

// Публичная функция listings — там обрабатываются action=consent_save и consent_check
const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';

// Cookie-дубль флага согласия — на случай если браузер очистит localStorage
// (например Safari/iOS удаляет localStorage после ~7 дней без визита).
function setConsentCookie(): void {
  try {
    const oneYear = 365 * 24 * 60 * 60;
    document.cookie = `${CONSENT_KEY}=accepted; path=/; max-age=${oneYear}; SameSite=Lax`;
  } catch { /* ignore */ }
}

function readConsentCookie(): boolean {
  try {
    return document.cookie.split('; ').some(c => c === `${CONSENT_KEY}=accepted`);
  } catch {
    return false;
  }
}

export function hasConsent(): boolean {
  try {
    if (localStorage.getItem(CONSENT_KEY) === 'accepted') return true;
  } catch { /* ignore */ }
  // Фолбэк на cookie, если localStorage недоступен или был очищен браузером
  return readConsentCookie();
}

// Проверяет по IP на сервере — вызывается один раз при загрузке страницы.
// Если сервер говорит "уже принял" — сохраняем локально и не показываем баннер.
// Результат кешируем на 24ч чтобы не дёргать сервер при каждом открытии страницы.
export async function checkConsentByIp(onAccepted: () => void): Promise<void> {
  try {
    // Не проверяем чаще раза в сутки
    const lastCheck = Number(localStorage.getItem(CONSENT_SERVER_CHECK_KEY) || '0');
    if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) return;
    localStorage.setItem(CONSENT_SERVER_CHECK_KEY, String(Date.now()));
  } catch { /* ignore */ }

  try {
    const res = await fetch(LISTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'consent_check' }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.accepted) {
      // Сервер подтвердил — сохраняем локально и скрываем баннер
      saveConsent();
      onAccepted();
    }
  } catch { /* тихо игнорируем — не критично */ }
}

export function saveConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'accepted');
  } catch { /* ignore */ }
  setConsentCookie();
}

export function revokeConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(CONSENT_ID_KEY);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${CONSENT_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch { /* ignore */ }
}

function getSessionId(): string {
  try {
    let s = localStorage.getItem(CONSENT_SESSION_KEY);
    if (!s) {
      s = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CONSENT_SESSION_KEY, s);
    }
    return s;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

async function logConsent(documentsOpened: string[]): Promise<void> {
  try {
    const r = await fetch(LISTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'consent_save',
        documents_opened: documentsOpened,
        page_url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
        session_id: getSessionId(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    });
    if (!r.ok) return;
    const d = await r.json();
    if (d?.id) {
      try { localStorage.setItem(CONSENT_ID_KEY, String(d.id)); } catch { /* ignore */ }
    }
  } catch {
    // тихо игнорируем — лог не критичен для работы сайта
  }
}

interface Props {
  onAccept: () => void;
}

interface LegalDoc {
  key: 'privacy' | 'personal' | 'marketing';
  label: string;
  short: string;
  content: string;
}

function LegalModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85svh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
          <h3 className="font-display font-700 text-base sm:text-lg pr-2">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-muted transition-colors shrink-0"
            aria-label="Закрыть"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
        <div className="px-4 sm:px-6 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 transition-colors"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConsentBanner({ onAccept }: Props) {
  const { settings } = useSettings();
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);
  // Какие документы пользователь открывал — пишем в журнал для юр. защиты.
  const [openedDocs, setOpenedDocs] = useState<Set<string>>(() => new Set());

  // Открываем модалку конкретного документа и помечаем его как просмотренный
  const openDocument = (doc: LegalDoc) => {
    setOpenDoc(doc);
    setOpenedDocs(prev => {
      if (prev.has(doc.key)) return prev;
      const next = new Set(prev);
      next.add(doc.key);
      return next;
    });
  };

  const docs: LegalDoc[] = [
    {
      key: 'privacy',
      label: 'Политика конфиденциальности',
      short: 'Политика',
      content: settings.legal_privacy_policy || '',
    },
    {
      key: 'personal',
      label: 'Согласие на обработку персональных данных',
      short: 'Согласие на обработку ПД',
      content: settings.legal_personal_data || '',
    },
    {
      key: 'marketing',
      label: 'Согласие на рекламные рассылки',
      short: 'Согласие на рассылки',
      content: settings.legal_marketing_consent || '',
    },
  ].filter(d => d.content.trim().length > 0);

  const handleAccept = () => {
    saveConsent();
    // При согласии автоматически отмечаем ВСЕ документы как принятые —
    // в журнал для юридической защиты уходит полный список.
    logConsent(docs.map(d => d.key));
    onAccept();
  };

  return (
    <>
      {/* Мягкий баннер — БЕЗ блокирующего оверлея. Сайт доступен сразу,
          баннер просто висит снизу, пока пользователь не нажмёт «Согласен». */}
      <div
        data-consent-banner="true"
        className="fixed left-0 right-0 bottom-0 z-[100] flex justify-center pointer-events-none px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-6 animate-fade-in-up"
      >
        <div className="pointer-events-auto bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-brand-blue/10 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center shrink-0">
                <Icon name="ShieldCheck" size={20} className="text-brand-blue" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-800 text-base sm:text-lg text-foreground leading-tight">
                  Мы используем cookie и обрабатываем данные
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Нажмите «Согласен», чтобы продолжить
                </p>
              </div>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed">
              Используя сайт, вы соглашаетесь с обработкой персональных данных,
              получением рекламных рассылок и политикой конфиденциальности.
            </p>

            {/* Документы */}
            {docs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {docs.map(doc => {
                  const opened = openedDocs.has(doc.key);
                  return (
                    <button
                      key={doc.key}
                      onClick={() => openDocument(doc)}
                      className={`inline-flex items-center gap-1.5 text-xs sm:text-[13px] px-3 py-2 rounded-xl font-semibold transition-colors min-h-[40px] ${
                        opened
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-brand-blue/[0.07] text-brand-blue hover:bg-brand-blue/15'
                      }`}
                    >
                      <Icon name={opened ? 'CheckCircle2' : 'FileText'} size={13} />
                      {doc.label}
                      <Icon name="ExternalLink" size={11} className="opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions — только одна кнопка, без блокировки сайта */}
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-2 border-t border-border">
            <button
              onClick={handleAccept}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors min-h-[44px] shadow-lg shadow-emerald-600/20"
            >
              <Icon name="Check" size={16} />
              Согласен — продолжить
            </button>
          </div>
        </div>
      </div>

      {/* Модалка с текстом конкретного документа */}
      {openDoc && (
        <div data-consent-modal="true">
          <LegalModal
            title={openDoc.label}
            content={openDoc.content || 'Текст документа не настроен'}
            onClose={() => setOpenDoc(null)}
          />
        </div>
      )}
    </>
  );
}