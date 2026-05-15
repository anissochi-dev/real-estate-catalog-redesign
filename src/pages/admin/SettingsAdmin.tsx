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
  const [tab, setTab] = useState<'general' | 'watermark' | 'cities' | 'purposes' | 'feeds'>('general');

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
