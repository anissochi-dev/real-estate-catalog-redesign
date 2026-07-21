import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '@/App';
import Icon from '@/components/ui/icon';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { prefetchPage } from '@/app/lazyPages';
import OwnerSubmitModal from '@/components/OwnerSubmitModal';

interface NavbarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  favoritesCount: number;
  compareCount: number;
  onLogin: () => void;
  onAdmin: () => void;
  onAdminLeads?: () => void;
  onClientDashboard?: () => void;
}

const navItems = [
  { id: 'home' as Page, label: 'Главная', icon: 'Home' },
  { id: 'catalog' as Page, label: 'Каталог', icon: 'Building2' },
  { id: 'leads' as Page, label: 'Заявки', icon: 'FileText' },
  { id: 'news' as Page, label: 'Новости', icon: 'Newspaper' },
];

export default function Navbar({ currentPage, setCurrentPage, favoritesCount, compareCount, onLogin, onAdmin, onAdminLeads, onClientDashboard }: NavbarProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const isStaff = user && ['admin', 'editor', 'manager', 'director', 'broker', 'office_manager'].includes(user.role);
  const isClient = user && user.role === 'client';
  const brandName = settings.company_name || 'Бизнес. Маркетинг. Недвижимость.';
  const logoUrl = settings.logo_url;

  const handleNav = (page: Page) => {
    if (page === 'network-tenants' && isStaff && onAdminLeads) {
      onAdminLeads();
      setDrawerOpen(false);
      return;
    }
    setCurrentPage(page);
    setDrawerOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex md:grid md:grid-cols-[1fr_auto_1fr] items-center justify-between md:justify-normal h-14 md:h-16 gap-2">
            {/* Nav links — desktop, left column */}
            <nav className="hidden md:flex items-center gap-1 justify-self-start">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  onMouseEnter={() => prefetchPage(item.id)}
                  onFocus={() => prefetchPage(item.id)}
                  aria-label={'ariaLabel' in item ? (item as { ariaLabel: string }).ariaLabel : item.label}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                    ${currentPage === item.id
                      ? 'bg-brand-blue text-white'
                      : 'text-foreground hover:bg-muted'
                    }`}
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Logo — center column */}
            <button
              onClick={() => handleNav('home')}
              className="flex items-center justify-center group shrink-0 justify-self-center"
              aria-label={brandName}
            >
              <div className="flex items-center justify-center h-8 md:h-10 w-[160px] md:w-[220px] shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt={brandName} height={40} loading="eager" className="h-8 md:h-10 w-auto max-w-full object-contain" />
                ) : (
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg btn-blue flex items-center justify-center shrink-0">
                    <Icon name="Building" size={18} className="md:hidden text-white" />
                    <Icon name="Building" size={20} className="hidden md:block text-white" />
                  </div>
                )}
              </div>
            </button>

            {/* Right side — desktop, right column */}
            <div className="flex items-center gap-2 justify-self-end">
              {user && (
                isStaff ? (
                  <button
                    onClick={onAdmin}
                    title="Открыть админ-панель"
                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-brand-blue/10 text-sm transition-colors"
                  >
                    <Icon name="User" size={14} className="text-brand-blue flex-shrink-0" />
                    <span className="text-foreground font-medium">{user.name}</span>
                  </button>
                ) : isClient ? (
                  <button
                    onClick={onClientDashboard}
                    title="Личный кабинет"
                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-brand-blue/10 text-sm transition-colors"
                  >
                    <Icon name="LayoutDashboard" size={14} className="text-brand-blue flex-shrink-0" />
                    <span className="text-foreground font-medium">Кабинет</span>
                  </button>
                ) : (
                  <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
                    <Icon name="User" size={14} />
                    <span>{user.name}</span>
                  </div>
                )
              )}

              {/* Телефон */}
              <a
                href="tel:+79183352888"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-foreground hover:text-brand-blue hover:bg-muted transition-all duration-200 shrink-0"
              >
                <Icon name="Phone" size={15} className="text-brand-blue" />
                +7 (918) 33 52 888
              </a>

              {/* Кнопка "Разместить объект" */}
              <button
                onClick={() => setOwnerModalOpen(true)}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange/90 transition-all duration-200 shrink-0"
              >
                <Icon name="PlusCircle" size={15} />
                Разместить объект
              </button>

              {compareCount > 0 && (
                <button
                  onClick={() => handleNav('compare')}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-brand-orange text-brand-orange text-sm font-semibold hover:bg-brand-orange hover:text-white transition-all duration-200"
                >
                  <Icon name="GitCompare" size={15} />
                  <span>Сравнить ({compareCount})</span>
                </button>
              )}
              {/* Телефон — mobile */}
              <a
                href="tel:+79183352888"
                aria-label="Позвонить"
                className="md:hidden flex items-center gap-1 px-2 py-2.5 rounded-lg hover:bg-muted transition-colors min-h-[44px] text-brand-blue text-xs font-semibold whitespace-nowrap"
              >
                <Icon name="Phone" size={16} className="shrink-0" />
                +7 918 33 52 888
              </a>

              {/* Hamburger — mobile */}
              <button
                onClick={() => {
                  setDrawerOpen(true);
                  navItems.forEach(i => prefetchPage(i.id));
                }}
                className="md:hidden p-2.5 rounded-lg hover:bg-muted transition-colors relative min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Открыть меню"
              >
                <Icon name="Menu" size={22} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      {drawerOpen && <div
        className="fixed top-0 right-0 h-full w-[280px] max-w-[85vw] z-[70] bg-white shadow-2xl flex flex-col transition-transform duration-300 md:hidden pb-safe translate-x-0"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} width={32} height={32} className="w-8 h-8 rounded-lg object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg btn-blue flex items-center justify-center">
                <Icon name="Building" size={16} className="text-white" />
              </div>
            )}
            <span className="font-display font-800 text-base text-brand-blue">{brandName}</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Закрыть"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Кнопка "Разместить объект" — мобиль */}
          <button
            onClick={() => { setOwnerModalOpen(true); setDrawerOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-brand-orange text-white hover:bg-brand-orange/90 transition mb-1"
          >
            <Icon name="PlusCircle" size={18} />
            Разместить объект
          </button>

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              onTouchStart={() => prefetchPage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left
                ${currentPage === item.id
                  ? 'bg-brand-blue text-white'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <Icon name={item.icon} size={18} />
              <span className="flex-1">{item.label}</span>
            </button>
          ))}

          {compareCount > 0 && (
            <button
              onClick={() => { handleNav('compare'); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border-2 border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-all duration-200"
            >
              <Icon name="GitCompare" size={18} />
              <span className="flex-1">Сравнить</span>
              <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-[11px] font-bold flex items-center justify-center">
                {compareCount}
              </span>
            </button>
          )}
        </nav>

        {/* Drawer footer */}
        <div className="shrink-0 p-3 border-t border-border space-y-1">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                <Icon name="User" size={16} />
                <span className="truncate">{user.name}</span>
              </div>
              {isStaff && (
                <button
                  onClick={() => { onAdmin(); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-brand-blue hover:bg-brand-blue/10 transition"
                >
                  <Icon name="Shield" size={18} />
                  Админ-панель
                </button>
              )}
              {isClient && (
                <button
                  onClick={() => { onClientDashboard?.(); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-brand-blue hover:bg-brand-blue/10 transition"
                >
                  <Icon name="LayoutDashboard" size={18} />
                  Личный кабинет
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => { onLogin(); setDrawerOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition"
            >
              <Icon name="LogIn" size={18} />
              Войти
            </button>
          )}
        </div>
      </div>}

      {/* Плавающая кнопка избранного — видна только если есть добавленные объекты */}
      {favoritesCount > 0 && (
        <button
          onClick={() => handleNav('favorites')}
          onMouseEnter={() => prefetchPage('favorites')}
          aria-label={`Избранное (${favoritesCount})`}
          className={`fixed right-4 z-40 w-12 h-12 rounded-full bg-white shadow-lg border border-border flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 animate-scale-in ${
            compareCount > 0 ? 'bottom-24' : 'bottom-4'
          }`}
        >
          <Icon name="Heart" size={22} className="text-red-500" fill="currentColor" />
        </button>
      )}

      {/* Модальная форма собственника */}
      {ownerModalOpen && <OwnerSubmitModal onClose={() => setOwnerModalOpen(false)} />}
    </>
  );
}