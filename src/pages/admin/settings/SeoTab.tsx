import Icon from '@/components/ui/icon';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

export default function SeoTab({ s, setS, saved, save }: Props) {
  return (
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
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 border rounded-lg" placeholder="https://example.ru"
              value={s.site_url || ''}
              onChange={e => setS({ ...s, site_url: e.target.value })} />
            {!s.site_url && (
              <button
                type="button"
                onClick={() => setS({ ...s, site_url: window.location.origin })}
                className="px-3 py-2 rounded-lg border border-brand-blue text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 whitespace-nowrap"
              >
                Заполнить автоматически
              </button>
            )}
          </div>
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

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}