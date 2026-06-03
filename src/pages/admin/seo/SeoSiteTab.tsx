import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { S } from '../settings/types';

export default function SeoSiteTab() {
  const { reload } = useSettings();
  const [s, setS] = useState<Partial<S>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.getSettings().then(d => setS(d.settings || {}));
  }, []);

  const save = async () => {
    await adminApi.updateSettings(s as Record<string, unknown>);
    setSaved(true);
    await reload();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="Search" size={18} className="text-brand-blue" /> Основные SEO-настройки
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Данные используются поисковыми системами для главной страницы и Open Graph.
        </p>

        <div>
          <label className="text-sm font-semibold block mb-1">Адрес сайта</label>
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
              placeholder="https://example.ru"
              value={s.site_url || ''}
              onChange={e => setS({ ...s, site_url: e.target.value })} />
            {!s.site_url && (
              <button type="button"
                onClick={() => setS({ ...s, site_url: window.location.origin })}
                className="px-3 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 whitespace-nowrap">
                Заполнить автоматически
              </button>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Используется в sitemap.xml и Open Graph.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">SEO-описание сайта
            <span className="ml-2 text-xs font-normal text-muted-foreground">({(s.seo_description || '').length}/160)</span>
          </label>
          <textarea rows={3} className="w-full px-3 py-2 border rounded-lg focus:border-brand-blue outline-none resize-none"
            placeholder="Каталог коммерческой недвижимости и готового бизнеса..."
            value={s.seo_description || ''}
            onChange={e => setS({ ...s, seo_description: e.target.value })} />
          <div className="text-xs text-muted-foreground mt-1">Отображается в сниппете поисковой выдачи для главной страницы.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Ключевые слова</label>
          <input className="w-full px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
            placeholder="коммерческая недвижимость, готовый бизнес, аренда офиса"
            value={s.seo_keywords || ''}
            onChange={e => setS({ ...s, seo_keywords: e.target.value })} />
          <div className="text-xs text-muted-foreground mt-1">Через запятую. Яндекс и Google учитывают умеренно.</div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Год основания компании</label>
          <input type="number" className="w-32 px-3 py-2 border rounded-lg focus:border-brand-blue outline-none"
            placeholder="2007"
            value={s.company_since_year ?? ''}
            onChange={e => setS({ ...s, company_since_year: +e.target.value })} />
          <div className="text-xs text-muted-foreground mt-1">Отображается на главной: «На рынке с 2007».</div>
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm font-semibold">Сохранено ✓</span>}
      </div>
    </div>
  );
}
