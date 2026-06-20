import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Page } from '@/App';
import { fetchDistricts, District } from '@/lib/api';

interface Props {
  onLogin: () => void;
  setCurrentPage: (p: Page) => void;
}

function LegalModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-display font-700 text-lg">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CATEGORIES: { label: string; href: string }[] = [
  { label: 'Офисы', href: '/catalog/office' },
  { label: 'Магазин, торговое помещение', href: '/catalog/retail' },
  { label: 'Склады', href: '/catalog/warehouse' },
  { label: 'Общепит, кафе, ресторан', href: '/catalog/restaurant' },
  { label: 'Гостиницы', href: '/catalog/hotel' },
  { label: 'Готовый бизнес', href: '/catalog/business' },
  { label: 'Готовый арендный бизнес (ГАБ)', href: '/catalog/gab' },
  { label: 'Производственное помещение', href: '/catalog/production' },
  { label: 'Земельный участок', href: '/catalog/land' },
  { label: 'Отдельно стоящее здание', href: '/catalog/building' },
  { label: 'Свободное назначение', href: '/catalog/free_purpose' },
  { label: 'Автосервис', href: '/catalog/car_service' },
];

function parseLinks(raw: string): { label: string; href: string }[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [label, href] = line.split('|').map(s => s.trim());
      return label && href ? { label, href } : null;
    })
    .filter(Boolean) as { label: string; href: string }[];
}

export default function Footer({ onLogin, setCurrentPage }: Props) {
  const { settings } = useSettings();
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);

  useEffect(() => {
    fetchDistricts().then(d => setDistricts(d.filter(x => x.listings_count && x.listings_count > 0)));
  }, []);

  const company = settings.company_name || 'Бизнес. Маркетинг. Недвижимость.';
  const phone = settings.company_phone;
  const email = settings.company_email;
  const city = settings.main_city || 'Краснодар';
  const description = settings.footer_description || `Коммерческая недвижимость и готовый бизнес ${city}а.`;

  const categoryLinks = settings.footer_extra_links
    ? parseLinks(settings.footer_extra_links)
    : null;

  const legalDocs = [
    settings.legal_privacy_policy
      ? { label: 'Политика конфиденциальности', content: settings.legal_privacy_policy }
      : null,
    settings.legal_personal_data
      ? { label: 'Согласие на обработку персональных данных', content: settings.legal_personal_data }
      : null,
    settings.legal_marketing_consent
      ? { label: 'Согласие на рекламные рассылки', content: settings.legal_marketing_consent }
      : null,
  ].filter(Boolean) as { label: string; content: string }[];

  return (
    <>
      <footer className="bg-brand-blue-dark text-white/80 mt-12">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-8">

            {/* Компания */}
            <div className="md:col-span-1">
              <h3 className="font-display font-800 text-white text-lg mb-2">{company}</h3>
              <div className="text-sm leading-relaxed">{description}</div>
            </div>

            {/* Категории — 3 колонки */}
            <div className="md:col-span-3">
              <h3 className="font-semibold text-white mb-3">Категории</h3>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                {(categoryLinks || DEFAULT_CATEGORIES).map(item => (
                  <li key={item.href}>
                    <Link to={item.href} className="hover:text-white transition-colors">{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Контакты */}
            <div className="md:col-span-1">
              <h3 className="font-semibold text-white mb-3">Контакты</h3>
              <ul className="space-y-2 text-sm">
                {phone && <li><a href={`tel:${phone}`} className="hover:text-white transition-colors break-all">{phone}</a></li>}
                {email && <li><a href={`mailto:${email}`} className="hover:text-white transition-colors break-all">{email}</a></li>}
              </ul>
            </div>
          </div>

          {/* Районы города — SEO-ссылки, все 45 */}
          {districts.length > 0 && (
            <div className="border-t border-white/10 mt-6 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="MapPin" size={14} className="text-white/60" />
                <h3 className="font-semibold text-white/80 text-sm">
                  Коммерческая недвижимость по районам — {city}
                </h3>
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                {districts.map(d => {
                  const cnt = d.listings_count ?? 0;
                  const big = cnt >= 10;
                  const mid = cnt >= 3 && cnt < 10;
                  return (
                    <Link
                      key={d.id}
                      to={`/district/${d.slug}`}
                      className={`inline-flex items-center gap-1 rounded-md transition-colors text-[11px] px-2 py-1 ${
                        big
                          ? 'bg-white/10 border border-white/15 text-white/85 hover:bg-white/18 hover:text-white'
                          : mid
                          ? 'bg-white/5 border border-white/8 text-white/65 hover:bg-white/10 hover:text-white/90'
                          : 'text-white/45 hover:text-white/75'
                      }`}
                    >
                      {d.name}
                      {cnt > 0 && (
                        <span className={`${big ? 'text-white/50' : 'text-white/30'} tabular-nums`}>
                          {cnt}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Правовые документы — по центру */}
          {legalDocs.length > 0 && (
            <div className="border-t border-white/10 mt-6 pt-5">
              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-6 gap-y-2">
                {legalDocs.map(doc => (
                  <button
                    key={doc.label}
                    onClick={() => setModal({ title: doc.label, content: doc.content })}
                    className="text-xs text-white/50 hover:text-white/80 active:text-white/90 underline underline-offset-2 transition-colors text-center min-h-[28px]"
                  >
                    {doc.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Правовое уведомление + копирайт — по центру на всех экранах */}
          <div className="border-t border-white/10 mt-5 pt-4 pb-[max(4px,env(safe-area-inset-bottom))] text-center space-y-1.5">
            <p className="text-[11px] sm:text-xs text-white/40 leading-relaxed max-w-6xl mx-auto">
              Все материалы сайта принадлежат: Бизнес. Маркетинг. Недвижимость. (Б.М.Н.). При перепечатке ссылка на данный сайт обязательна.<br />
              Вся информация, опубликованная на сайте, носит исключительно информационный характер и не является публичной офертой, определяемой положениями ст.&nbsp;437 ГК РФ.
            </p>
            <div className="text-[11px] sm:text-xs text-white/40 leading-relaxed inline-flex flex-wrap items-center justify-center gap-x-1">
              <span>© {new Date().getFullYear()} {company}.</span>
              <span className="whitespace-nowrap inline-flex items-center gap-1">
                Все права защищены.
                <button
                  onClick={onLogin}
                  aria-label="Вход для сотрудников"
                  title="Вход для сотрудников"
                  className="text-white/30 hover:text-white/70 active:text-white/90 focus-visible:text-white/80 transition-colors p-1.5 -m-0.5 rounded inline-flex items-center justify-center min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 sm:p-1"
                >
                  <Icon name="Lock" size={12} className="sm:hidden" />
                  <Icon name="Lock" size={11} className="hidden sm:block" />
                </button>
              </span>
            </div>
          </div>
        </div>
      </footer>

      {modal && (
        <LegalModal
          title={modal.title}
          content={modal.content}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}