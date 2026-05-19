import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Page } from '@/App';

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

export default function Footer({ onLogin, setCurrentPage }: Props) {
  const { settings } = useSettings();
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null);

  const company = settings.company_name || 'BIZNEST';
  const phone = settings.company_phone;
  const email = settings.company_email;
  const city = settings.main_city || 'Краснодар';

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="font-display font-800 text-white text-lg mb-2">{company}</div>
              <div className="text-sm">Коммерческая недвижимость и готовый бизнес {city}а.</div>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">Каталог</div>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => setCurrentPage('catalog')} className="hover:text-white transition-colors">Все объекты</button></li>
                <li><button onClick={() => setCurrentPage('map')} className="hover:text-white transition-colors">На карте</button></li>
                <li><button onClick={() => setCurrentPage('network-tenants')} className="hover:text-white transition-colors">Заявки</button></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">Категории</div>
              <ul className="space-y-2 text-sm">
                <li><Link to="/catalog/office" className="hover:text-white transition-colors">Офисы</Link></li>
                <li><Link to="/catalog/retail" className="hover:text-white transition-colors">Торговые помещения</Link></li>
                <li><Link to="/catalog/warehouse" className="hover:text-white transition-colors">Склады</Link></li>
                <li><Link to="/catalog/business" className="hover:text-white transition-colors">Готовый бизнес</Link></li>
                <li><Link to="/catalog/gab" className="hover:text-white transition-colors">ГАБ</Link></li>
                <li><Link to="/catalog/restaurant" className="hover:text-white transition-colors">Общепит</Link></li>
                <li><Link to="/catalog/production" className="hover:text-white transition-colors">Производство</Link></li>
                <li><Link to="/catalog/land" className="hover:text-white transition-colors">Земельные участки</Link></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-3">Контакты</div>
              <ul className="space-y-2 text-sm">
                {phone && <li><a href={`tel:${phone}`} className="hover:text-white transition-colors">{phone}</a></li>}
                {email && <li><a href={`mailto:${email}`} className="hover:text-white transition-colors">{email}</a></li>}
                <li className="pt-1 text-white/50">{city}, с {settings.company_since_year || 2007} года</li>
              </ul>
            </div>
          </div>

          {/* Правовые документы */}
          {legalDocs.length > 0 && (
            <div className="border-t border-white/10 mt-6 pt-5">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {legalDocs.map(doc => (
                  <button
                    key={doc.label}
                    onClick={() => setModal({ title: doc.label, content: doc.content })}
                    className="text-xs text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors"
                  >
                    {doc.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-white/10 mt-5 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2">
            <div className="text-xs text-white/40">© {new Date().getFullYear()} {company}. Все права защищены.</div>
            <button onClick={onLogin}
              className="text-[11px] text-white/30 hover:text-white/70 inline-flex items-center gap-1 transition">
              <Icon name="Lock" size={10} />
              Вход для сотрудников
            </button>
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
