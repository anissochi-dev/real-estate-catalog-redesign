import { Link } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Page } from '@/App';

interface Props {
  onLogin: () => void;
  setCurrentPage: (p: Page) => void;
}

export default function Footer({ onLogin, setCurrentPage }: Props) {
  const { settings } = useSettings();
  const company = settings.company_name || 'BIZNEST';
  const phone = settings.company_phone;
  const email = settings.company_email;
  const city = settings.main_city || 'Краснодар';

  return (
    <footer className="bg-brand-blue-dark text-white/80 mt-12">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="font-display font-800 text-white text-lg mb-3">{company}</div>
            <div className="text-sm">Коммерческая недвижимость и готовый бизнес {city}а.</div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Каталог</div>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => setCurrentPage('catalog')} className="hover:text-white">Все объекты</button></li>
              <li><button onClick={() => setCurrentPage('map')} className="hover:text-white">На карте</button></li>
              <li><button onClick={() => setCurrentPage('network-tenants')} className="hover:text-white">Заявки</button></li>
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
              {phone && <li><a href={`tel:${phone}`} className="hover:text-white">{phone}</a></li>}
              {email && <li><a href={`mailto:${email}`} className="hover:text-white">{email}</a></li>}
              <li className="pt-1 text-white/50">{city}, с {settings.company_since_year || 2007} года</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-5 flex flex-col md:flex-row justify-between items-center gap-2">
          <div className="text-xs text-white/40">© {new Date().getFullYear()} {company}. Все права защищены.</div>
          <button onClick={onLogin}
            className="text-[11px] text-white/30 hover:text-white/70 inline-flex items-center gap-1 transition">
            <Icon name="Lock" size={10} />
            Вход для сотрудников
          </button>
        </div>
      </div>
    </footer>
  );
}