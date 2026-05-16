import { useEffect, useState } from 'react';
import { adminApi, aiApi } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import ImageUploader from '@/components/admin/ImageUploader';
import PurposesAdmin from './PurposesAdmin';
import XmlFeedsAdmin from './XmlFeedsAdmin';
import Icon from '@/components/ui/icon';

interface S {
  company_name: string;
  company_phone: string;
  company_email: string;
  company_address: string;
  hero_title: string;
  hero_subtitle: string;
  about_text: string;
  logo_url: string;
  main_city: string;
  watermark_url: string;
  watermark_enabled: boolean;
  watermark_position: string;
  watermark_opacity: number;
  yandex_maps_api_key: string;
  yandex_metrika_id: string;
  google_analytics_id: string;
  company_since_year: number;
  site_url: string;
  seo_keywords: string;
  seo_description: string;
  yandex_api_key: string;
  yandex_folder_id: string;
}

interface City {
  id: number;
  name: string;
  region: string | null;
  is_active: boolean;
}

const WM_POS = [
  ['bottom-right', 'Снизу справа'],
  ['bottom-left', 'Снизу слева'],
  ['top-right', 'Сверху справа'],
  ['top-left', 'Сверху слева'],
  ['center', 'По центру'],
];

export default function SettingsAdmin() {
  const { reload } = useSettings();
  const [s, setS] = useState<Partial<S>>({});
  const [cities, setCities] = useState<City[]>([]);
  const [saved, setSaved] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityAdding, setCityAdding] = useState(false);
  const [tab, setTab] = useState<'general' | 'watermark' | 'seo' | 'integrations' | 'cities' | 'purposes' | 'feeds'>('general');
  const [showKey, setShowKey] = useState(false);
  const [pingState, setPingState] = useState<{ loading: boolean; status: 'idle' | 'ok' | 'err'; message: string }>({
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

  const loadCities = () => adminApi.listCities().then(d => setCities(d.cities));

  useEffect(() => {
    adminApi.getSettings().then(d => setS(d.settings || {}));
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

  const field = (key: keyof S, label: string, multiline = false) => (
    <div>
      <label className="text-sm font-semibold block mb-1">{label}</label>
      {multiline ? (
        <textarea className="w-full px-3 py-2 border rounded-lg" rows={3}
          value={(s[key] as string) || ''} onChange={e => setS({ ...s, [key]: e.target.value })} />
      ) : (
        <input className="w-full px-3 py-2 border rounded-lg"
          value={(s[key] as string) || ''} onChange={e => setS({ ...s, [key]: e.target.value })} />
      )}
    </div>
  );

  const TABS: [typeof tab, string, string][] = [
    ['general', 'Общие', 'Settings'],
    ['watermark', 'Водяной знак', 'Stamp'],
    ['seo', 'SEO и аналитика', 'BarChart3'],
    ['integrations', 'Интеграции ИИ', 'Zap'],
    ['cities', 'Города', 'MapPin'],
    ['purposes', 'Назначения', 'Tag'],
    ['feeds', 'XML фиды', 'Rss'],
  ];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm overflow-x-auto">
        {TABS.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-sm whitespace-nowrap transition inline-flex items-center justify-center gap-1.5 ${
              tab === id ? 'bg-brand-blue text-white' : 'hover:bg-muted'
            }`}>
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg mb-2">Логотип</div>
            <ImageUploader
              value={s.logo_url ? [s.logo_url] : []}
              onChange={urls => setS({ ...s, logo_url: urls[0] || '' })}
              folder="logo"
              multiple={false}
              hint="Перетащите файл логотипа или выберите с устройства. PNG прозрачный, рекомендуется 512×512"
            />
            {field('company_name', 'Название компании')}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg mb-2">Контакты</div>
            {field('company_phone', 'Телефон')}
            {field('company_email', 'Email')}
            {field('company_address', 'Адрес')}
            <div>
              <label className="text-sm font-semibold block mb-1">Основной город</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={s.main_city || 'Краснодар'}
                onChange={e => setS({ ...s, main_city: e.target.value })}>
                {cities.filter(c => c.is_active).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg mb-2">Главная страница</div>
            {field('hero_title', 'Заголовок Hero')}
            {field('hero_subtitle', 'Подзаголовок Hero', true)}
            {field('about_text', 'О компании', true)}
          </div>

          <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
            <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
            {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
          </div>
        </div>
      )}

      {tab === 'watermark' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <div className="font-display font-700 text-lg">Водяной знак</div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!s.watermark_enabled}
                onChange={e => setS({ ...s, watermark_enabled: e.target.checked })} />
              <span className="text-sm">Включить водяной знак на фото</span>
            </label>
            <div>
              <label className="text-sm font-semibold block mb-1">Изображение водяного знака</label>
              <ImageUploader
                value={s.watermark_url ? [s.watermark_url] : []}
                onChange={urls => setS({ ...s, watermark_url: urls[0] || '' })}
                folder="watermark" multiple={false}
                hint="PNG с прозрачным фоном"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold block mb-1">Позиция</label>
                <select className="w-full px-3 py-2 border rounded-lg" value={s.watermark_position || 'bottom-right'}
                  onChange={e => setS({ ...s, watermark_position: e.target.value })}>
                  {WM_POS.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-1">Прозрачность, %</label>
                <input type="number" min={10} max={100} className="w-full px-3 py-2 border rounded-lg"
                  value={s.watermark_opacity ?? 50}
                  onChange={e => setS({ ...s, watermark_opacity: +e.target.value })} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              На уровне отдельного объявления можно отключить водяной знак — галочкой «Использовать водяной знак».
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
            {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
          </div>
        </div>
      )}

      {tab === 'seo' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="BarChart3" size={18} /> Счётчики аналитики
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">ID Яндекс.Метрики</label>
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="например 12345678"
                value={s.yandex_metrika_id || ''}
                onChange={e => setS({ ...s, yandex_metrika_id: e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">Получить: metrika.yandex.ru → создать счётчик → скопировать номер.</div>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">ID Google Analytics (GA4)</label>
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="G-XXXXXXXXXX"
                value={s.google_analytics_id || ''}
                onChange={e => setS({ ...s, google_analytics_id: e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">Получить: analytics.google.com → Admin → Data Streams.</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Search" size={18} /> SEO — для поисковых систем
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Адрес сайта</label>
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="https://example.ru"
                value={s.site_url || ''}
                onChange={e => setS({ ...s, site_url: e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">Используется в sitemap.xml и Open Graph.</div>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Год основания</label>
              <input type="number" className="w-full px-3 py-2 border rounded-lg" placeholder="2007"
                value={s.company_since_year ?? 2007}
                onChange={e => setS({ ...s, company_since_year: +e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">Отображается на главной: «На рынке с 2007».</div>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">SEO-описание сайта</label>
              <textarea rows={3} className="w-full px-3 py-2 border rounded-lg"
                placeholder="Каталог коммерческой недвижимости и готового бизнеса в Краснодаре с 2007 года..."
                value={s.seo_description || ''}
                onChange={e => setS({ ...s, seo_description: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Ключевые слова</label>
              <input className="w-full px-3 py-2 border rounded-lg"
                placeholder="коммерческая недвижимость, готовый бизнес, аренда офиса"
                value={s.seo_keywords || ''}
                onChange={e => setS({ ...s, seo_keywords: e.target.value })} />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Map" size={18} /> Яндекс.Карты
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">API-ключ Яндекс.Карт</label>
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="12345678-abcd-1234-abcd-1234567890ab"
                value={s.yandex_maps_api_key || ''}
                onChange={e => setS({ ...s, yandex_maps_api_key: e.target.value })} />
              <div className="text-xs text-muted-foreground mt-1">developer.tech.yandex.ru → JavaScript API и Геокодер.</div>
            </div>
          </div>

          <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
            <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
            {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
            <div className="font-display font-700 text-lg flex items-center gap-2">
              <Icon name="Sparkles" size={18} className="text-brand-blue" />
              YandexGPT 5 Pro (Алиса)
            </div>
            <p className="text-sm text-muted-foreground">
              Ключи для работы ИИ-подбора, генерации описаний, ответов на лиды и SEO. Получить можно в Yandex Cloud Console.
            </p>

            <div>
              <label className="text-sm font-semibold block mb-1">API-ключ YandexGPT</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                  type={showKey ? 'text' : 'password'}
                  placeholder="AQVN..."
                  value={s.yandex_api_key || ''}
                  onChange={e => setS({ ...s, yandex_api_key: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-3 py-2 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-1"
                >
                  <Icon name={showKey ? 'EyeOff' : 'Eye'} size={14} />
                </button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                console.cloud.yandex.ru → Сервисные аккаунты → создать API-ключ с ролью <b>ai.languageModels.user</b>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold block mb-1">ID каталога (Folder ID)</label>
              <input
                className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                placeholder="b1g..."
                value={s.yandex_folder_id || ''}
                onChange={e => setS({ ...s, yandex_folder_id: e.target.value })}
              />
              <div className="text-xs text-muted-foreground mt-1">
                ID каталога Yandex Cloud, в котором создан сервисный аккаунт (например, b1gtl2q...).
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
              <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                Ключи хранятся в защищённой БД и используются только на сервере. На фронт не передаются.
                Если поля оставить пустыми — используются системные ключи проекта (если настроены).
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="font-display font-700 text-base mb-3">Как получить ключи Yandex Cloud</div>
            <ol className="space-y-2 text-sm text-foreground list-decimal pl-5">
              <li>Зайти в <a href="https://console.cloud.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">console.cloud.yandex.ru</a></li>
              <li>Скопировать <b>ID каталога</b> из URL или со страницы каталога</li>
              <li>Создать <b>сервисный аккаунт</b> и назначить ему роль <code className="bg-muted px-1 rounded">ai.languageModels.user</code></li>
              <li>У сервисного аккаунта создать <b>API-ключ</b> (не IAM-токен)</li>
              <li>Вставить ключ и Folder ID в поля выше → нажать «Сохранить»</li>
            </ol>
          </div>

          {pingState.status !== 'idle' && (
            <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
              pingState.status === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              <Icon
                name={pingState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'}
                size={16}
                className="flex-shrink-0 mt-0.5"
              />
              <div>{pingState.message}</div>
            </div>
          )}

          <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20 flex-wrap">
            <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">
              Сохранить
            </button>
            <button
              onClick={testConnection}
              disabled={pingState.loading || (!s.yandex_api_key && !s.yandex_folder_id)}
              className="px-5 py-3 rounded-xl border-2 border-brand-blue text-brand-blue font-semibold inline-flex items-center gap-2 hover:bg-brand-blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pingState.loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Проверяем...
                </>
              ) : (
                <>
                  <Icon name="Plug" size={14} />
                  Проверить подключение
                </>
              )}
            </button>
            {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
          </div>
        </div>
      )}

      {tab === 'cities' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="font-display font-700 text-lg mb-4">Города</div>

          <div className="flex gap-2 mb-4">
            <input className="flex-1 px-3 py-2 border rounded-lg text-sm"
              placeholder="Название нового города (например: Геленджик)"
              value={cityQuery} onChange={e => setCityQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aiAddCity()} />
            <button onClick={aiAddCity} disabled={cityAdding || !cityQuery.trim()}
              className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
              <Icon name="Sparkles" size={14} />
              {cityAdding ? 'Добавляем...' : 'Добавить через ИИ'}
            </button>
          </div>

          <div className="space-y-2">
            {cities.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  {c.region && <div className="text-xs text-muted-foreground">{c.region}</div>}
                </div>
                <button onClick={() => toggleCity(c)}
                  className={`text-xs px-3 py-1 rounded-lg font-semibold ${
                    c.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-muted hover:bg-muted/70'
                  }`}>
                  {c.is_active ? 'Активен' : 'Скрыт'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'purposes' && <PurposesAdmin />}
      {tab === 'feeds' && <XmlFeedsAdmin />}
    </div>
  );
}