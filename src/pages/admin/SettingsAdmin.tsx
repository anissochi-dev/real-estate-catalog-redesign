import { useEffect, useState } from 'react';
import { adminApi, aiApi, CRM_PAYMENTS_URL, getToken } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import PurposesAdmin from './PurposesAdmin';
import LandVriAdmin from './LandVriAdmin';
import XmlFeedsAdmin from './XmlFeedsAdmin';
import RolesAdmin from './RolesAdmin';
import PagesAdmin from './PagesAdmin';
import MigrationTab from './settings/MigrationTab';
import PhotoOptimizeTab from './settings/PhotoOptimizeTab';
import Icon from '@/components/ui/icon';
import { S, City, PingState } from './settings/types';
import GeneralTab from './settings/GeneralTab';
import IntegrationsTab from './settings/IntegrationsTab';
import CitiesTab from './settings/CitiesTab';
import LegalTab from './settings/LegalTab';
import FooterTab from './settings/FooterTab';
import AdPlatformsTab from './settings/AdPlatformsTab';
import AutoPostingTab from './settings/AutoPostingTab';
import BrandKitTab from './settings/BrandKitTab';
import NotificationsTab from './settings/NotificationsTab';
import SiteHealthTab from './settings/SiteHealthTab';
import VerificationTab from './settings/VerificationTab';

export default function SettingsAdmin() {
  const { reload } = useSettings();
  const [s, setS] = useState<Partial<S>>({});
  const [cities, setCities] = useState<City[]>([]);
  const [saved, setSaved] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityAdding, setCityAdding] = useState(false);
  type TabId = 'general' | 'watermark' | 'brand-kit' | 'footer' | 'legal'
    | 'integrations' | 'ad-platforms' | 'autoposting' | 'feeds' | 'notifications'
    | 'cities' | 'purposes' | 'land-vri' | 'pages' | 'roles' | 'migration' | 'photo-optimize' | 'site-health' | 'verification';
  const [tab, setTab] = useState<TabId>('general');
  const [showKey, setShowKey] = useState(false);
  const [showMapsKey, setShowMapsKey] = useState(false);
  const [showYkSecret, setShowYkSecret] = useState(false);
  const [pingState, setPingState] = useState<PingState>({
    loading: false, status: 'idle', message: '',
  });
  const [mapsState, setMapsState] = useState<PingState>({
    loading: false, status: 'idle', message: '',
  });
  const [ykState, setYkState] = useState<PingState>({
    loading: false, status: 'idle', message: '',
  });

  const testConnection = async () => {
    setPingState({ loading: true, status: 'idle', message: '' });
    try {
      const r = await aiApi.ping(s.yandex_api_key, s.yandex_folder_id);
      setPingState({
        loading: false,
        status: 'ok',
        message: `${r.message}. Ответ модели: «${r.reply || '—'}». Токенов: ${r.tokens}`,
      });
    } catch (e) {
      setPingState({
        loading: false,
        status: 'err',
        message: e instanceof Error ? e.message : 'Ошибка проверки',
      });
    }
  };

  const testMapsKey = async () => {
    const key = (s.yandex_maps_api_key || '').trim();
    if (!key) {
      setMapsState({ loading: false, status: 'err', message: 'Введите API-ключ Яндекс.Карт' });
      return;
    }
    setMapsState({ loading: true, status: 'idle', message: '' });

    // Проверяем доступ к Геокодеру (поиск адреса, район) и Геосаджесту (подсказки).
    // Оба сервиса нужны для работы поля адреса при добавлении объекта.
    const checkGeocoder = async (): Promise<boolean> => {
      try {
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(key)}&format=json&geocode=Краснодар&results=1`;
        const res = await fetch(url);
        if (!res.ok) return false;
        const data = await res.json().catch(() => ({}));
        if (data?.statusCode === 403 || data?.error) return false;
        return !!data?.response?.GeoObjectCollection;
      } catch {
        return false;
      }
    };

    const checkSuggest = async (): Promise<boolean> => {
      try {
        const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${encodeURIComponent(key)}&text=Краснодар, Красная&results=3&lang=ru`;
        const res = await fetch(url);
        if (!res.ok) return false;
        const data = await res.json().catch(() => null);
        return Array.isArray(data?.results);
      } catch {
        return false;
      }
    };

    const [geocoderOk, suggestOk] = await Promise.all([checkGeocoder(), checkSuggest()]);

    const line = (ok: boolean, label: string) => `${ok ? '✓' : '✗'} ${label}${ok ? ' — подключён' : ' — НЕ подключён'}`;
    const details = [
      line(geocoderOk, 'Геокодер (поиск адреса и район)'),
      line(suggestOk, 'Геосаджест (подсказки адреса)'),
    ].join('\n');

    if (geocoderOk && suggestOk) {
      setMapsState({ loading: false, status: 'ok', message: `Ключ полностью настроен:\n${details}` });
    } else if (geocoderOk || suggestOk) {
      setMapsState({
        loading: false, status: 'err',
        message: `Ключ работает частично:\n${details}\n\nПодключите недостающие сервисы в кабинете: developer.tech.yandex.ru`,
      });
    } else {
      setMapsState({
        loading: false, status: 'err',
        message: `Ключ не имеет доступа к нужным сервисам:\n${details}\n\nПодключите «API Геокодера» и «API Геосаджеста» к ключу в кабинете: developer.tech.yandex.ru`,
      });
    }
  };

  const testYookassa = async () => {
    const shopId = (s.yookassa_shop_id || '').trim();
    const secretKey = (s.yookassa_secret_key || '').trim();
    if (!shopId || !secretKey) {
      setYkState({ loading: false, status: 'err', message: 'Введите Shop ID и Secret Key' });
      return;
    }
    setYkState({ loading: true, status: 'idle', message: '' });
    try {
      const params = new URLSearchParams({ action: 'ping', shop_id: shopId, secret_key: secretKey });
      const r = await fetch(`${CRM_PAYMENTS_URL}/?${params}`, {
        headers: { 'X-Auth-Token': getToken() },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const mode = d.test ? ' (тестовый режим)' : ' (боевой режим)';
      setYkState({
        loading: false, status: 'ok',
        message: `Подключение успешно. Аккаунт: ${d.account_id || '—'}, статус: ${d.status || '—'}${mode}`,
      });
    } catch (e) {
      setYkState({
        loading: false, status: 'err',
        message: e instanceof Error ? e.message : 'Ошибка проверки',
      });
    }
  };

  const loadCities = () => adminApi.listCities().then(d => setCities(d.cities));

  useEffect(() => {
    adminApi.getSettings().then(d => {
      const settings = d.settings || {};
      if (!settings.site_url) {
        settings.site_url = window.location.origin;
        adminApi.updateSettings(settings as Record<string, unknown>).catch(() => {});
      }
      setS(settings);
    });
    loadCities();
  }, []);

  const save = async () => {
    try {
      await adminApi.updateSettings(s as Record<string, unknown>);
      setSaved(true);
      await reload();
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const aiAddCity = async () => {
    if (!cityQuery.trim()) return;
    setCityAdding(true);
    try {
      const r = await aiApi.ask('add_city', cityQuery.trim());
      if (r.text.startsWith('ERROR')) {
        alert('ИИ: ' + r.text);
        return;
      }
      const nameMatch = r.text.match(/ГОРОД:\s*(.+)/i);
      const regionMatch = r.text.match(/РЕГИОН:\s*(.+)/i);
      if (!nameMatch) {
        alert('ИИ не распознал город');
        return;
      }
      await adminApi.createCity({ name: nameMatch[1].trim(), region: regionMatch?.[1]?.trim() || '' });
      setCityQuery('');
      loadCities();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setCityAdding(false);
    }
  };

  const toggleCity = async (c: City) => {
    await adminApi.updateCity(c.id, { is_active: !c.is_active });
    loadCities();
  };

  type TabDef = [TabId, string, string];
  const GROUPS: { id: string; label: string; icon: string; tabs: TabDef[] }[] = [
    {
      id: 'company', label: 'Компания', icon: 'Building2', tabs: [
        ['general', 'Общие', 'Settings'],
        ['brand-kit', 'Бренд-кит', 'Palette'],
        ['watermark', 'Водяной знак', 'Stamp'],
        ['cities', 'Города', 'MapPin'],
      ],
    },
    {
      id: 'site', label: 'Сайт', icon: 'Globe', tabs: [
        ['pages', 'Страницы', 'FileText'],
        ['footer', 'Подвал', 'PanelBottom'],
        ['legal', 'Правовые', 'Scale'],
        ['purposes', 'Назначения', 'Tag'],
        ['land-vri', 'ВРИ земли', 'Sprout'],
      ],
    },
    {
      id: 'integrations', label: 'Интеграции', icon: 'Zap', tabs: [
        ['integrations', 'API и сервисы', 'Zap'],
        ['ad-platforms', 'Доски объявлений', 'Megaphone'],
        ['autoposting', 'Автопостинг', 'Share2'],
        ['feeds', 'XML фиды', 'Rss'],
        ['notifications', 'Уведомления', 'Bell'],
      ],
    },
    {
      id: 'admin', label: 'Администрирование', icon: 'Shield', tabs: [
        ['roles', 'Роли и доступы', 'ShieldHalf'],
        ['verification', 'Верификация', 'FileCheck'],
        ['migration', 'Экспорт/импорт', 'DatabaseBackup'],
        ['photo-optimize', 'Сжатие фото', 'ImageDown'],
        ['site-health', 'Диагностика', 'HeartPulse'],
      ],
    },
  ];

  const currentGroup = GROUPS.find(g => g.tabs.some(([id]) => id === tab)) || GROUPS[0];

  return (
    <div className="max-w-4xl space-y-3">
      {/* Группы */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm overflow-x-auto scrollbar-hide">
        {GROUPS.map(g => {
          const active = currentGroup.id === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setTab(g.tabs[0][0])}
              className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition inline-flex items-center justify-center gap-2 ${
                active ? 'bg-brand-blue text-white' : 'hover:bg-muted text-foreground/80'
              }`}
            >
              <Icon name={g.icon} size={15} />
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Вкладки текущей группы */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto scrollbar-hide">
        {currentGroup.tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`min-w-fit px-3 py-2 rounded-lg text-sm whitespace-nowrap transition inline-flex items-center justify-center gap-1.5 ${
              tab === id ? 'bg-white text-brand-blue shadow-sm font-semibold' : 'hover:bg-white/60 text-foreground/70'
            }`}>
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </div>

      {(tab === 'general' || tab === 'watermark') && (
        <GeneralTab tab={tab} s={s} setS={setS} cities={cities} saved={saved} save={save} />
      )}

      {tab === 'integrations' && (
        <IntegrationsTab
          s={s} setS={setS} saved={saved} save={save}
          showKey={showKey} setShowKey={setShowKey}
          showMapsKey={showMapsKey} setShowMapsKey={setShowMapsKey}
          showYkSecret={showYkSecret} setShowYkSecret={setShowYkSecret}
          pingState={pingState} mapsState={mapsState} ykState={ykState}
          testConnection={testConnection} testMapsKey={testMapsKey} testYookassa={testYookassa}
        />
      )}

      {tab === 'cities' && (
        <CitiesTab
          cities={cities}
          cityQuery={cityQuery} setCityQuery={setCityQuery}
          cityAdding={cityAdding}
          aiAddCity={aiAddCity}
          toggleCity={toggleCity}
        />
      )}

      {tab === 'ad-platforms' && <AdPlatformsTab />}
      {tab === 'purposes' && <PurposesAdmin />}
      {tab === 'land-vri' && <LandVriAdmin />}
      {tab === 'feeds' && <XmlFeedsAdmin />}
      {tab === 'legal' && <LegalTab s={s} setS={setS} saved={saved} save={save} />}
      {tab === 'footer' && <FooterTab s={s} setS={setS} saved={saved} save={save} />}
      {tab === 'roles' && <RolesAdmin />}
      {tab === 'autoposting' && <AutoPostingTab />}
      {tab === 'brand-kit' && <BrandKitTab s={s} setS={setS} saved={saved} save={save} />}
      {tab === 'notifications' && <NotificationsTab s={s} setS={setS} saved={saved} save={save} />}
      {tab === 'migration' && <MigrationTab />}
      {tab === 'photo-optimize' && <PhotoOptimizeTab />}
      {tab === 'site-health' && <SiteHealthTab />}
      {tab === 'verification' && (
        <VerificationTab
          files={(s.verification_files as { filename: string; content: string; comment?: string }[]) || []}
          onChange={files => setS(p => ({ ...p, verification_files: files }))}
          saved={saved}
          save={save}
        />
      )}
      {tab === 'pages' && <PagesAdmin />}
    </div>
  );
}