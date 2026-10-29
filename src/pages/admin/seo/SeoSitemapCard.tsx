import Icon from '@/components/ui/icon';
import { SeoStatus, fmtDate } from './seoTypes';

interface Props {
  seoErr: string;
  seoStatus: SeoStatus | null;
  seoLoading: boolean;
  rebuilding: boolean;
  rebuildSitemap: () => void;
}

export default function SeoSitemapCard({ seoErr, seoStatus, seoLoading, rebuilding, rebuildSitemap }: Props) {
  return (
    <>
  {/* Robots & Sitemap */}
  <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
    <div className="font-display font-700 text-lg flex items-center gap-2">
      <Icon name="FileCode2" size={18} className="text-brand-blue" /> Robots.txt и Sitemap.xml
    </div>

    {seoErr && (
      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{seoErr}</div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Robots */}
      <div className="rounded-xl border border-border p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="Shield" size={16} className="text-brand-blue" />
          <span className="font-semibold text-sm">robots.txt</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Управляет индексацией разделов сайта. Закрывает /admin, /login и системные страницы.
        </div>
        {seoStatus && (
          <div className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
            seoStatus.robots_exists ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <Icon name={seoStatus.robots_exists ? 'CheckCircle2' : 'AlertCircle'} size={11} />
            {seoStatus.robots_exists ? 'Работает' : 'Не создан'}
          </div>
        )}
        {seoStatus && (
          <a href={(seoStatus.sitemap_url || '').replace('/sitemap-full', '/robots.txt')} target="_blank" rel="noopener noreferrer"
            className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1 ml-2">
            <Icon name="ExternalLink" size={10} /> {(seoStatus.sitemap_url || '').replace('/sitemap-full', '/robots.txt')}
          </a>
        )}
        {seoLoading && <div className="text-xs text-muted-foreground">Загрузка...</div>}
      </div>

      {/* Sitemap */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="Map" size={16} className="text-brand-blue" />
          <span className="font-semibold text-sm">Карта сайта (/sitemap-full)</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Полная карта для Яндекс Вебмастера и Google: объекты, новости, районы, заявки и разделы. Обновляется автоматически.
        </div>
        {seoStatus && (
          <div className="space-y-2">
            {/* Итого в кэше */}
            <div className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
              seoStatus.sitemap_exists ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              <Icon name={seoStatus.sitemap_exists ? 'CheckCircle2' : 'AlertCircle'} size={11} />
              {seoStatus.sitemap_exists
                ? `В карте: ${seoStatus.sitemap_urls_count ?? '?'} страниц`
                : 'Не создан — нажмите «Перестроить»'}
            </div>
            {/* Разбивка по источникам */}
            {seoStatus.breakdown && (
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-1 text-center">
                  {[
                    { label: 'Объекты', value: seoStatus.breakdown.listings, color: 'bg-brand-blue/10 text-brand-blue' },
                    { label: 'Новости', value: seoStatus.breakdown.news, color: 'bg-purple-100 text-purple-700' },
                    { label: 'Страницы', value: seoStatus.breakdown.static, color: 'bg-emerald-100 text-emerald-700' },
                  ].map(b => (
                    <div key={b.label} className={`rounded-lg px-2 py-1.5 ${b.color}`}>
                      <div className="text-sm font-bold">{b.value}</div>
                      <div className="text-[10px]">{b.label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  {[
                    { label: 'Категории', value: seoStatus.breakdown.categories ?? 0, color: 'bg-amber-100 text-amber-700' },
                    { label: 'Районы', value: seoStatus.breakdown.districts ?? 0, color: 'bg-sky-100 text-sky-700' },
                    { label: 'Прочее', value: seoStatus.breakdown.other ?? 0, color: 'bg-slate-100 text-slate-600' },
                  ].map(b => (
                    <div key={b.label} className={`rounded-lg px-2 py-1.5 ${b.color}`}>
                      <div className="text-sm font-bold">{b.value}</div>
                      <div className="text-[10px]">{b.label}</div>
                    </div>
                  ))}
                </div>
                <div className="text-xs font-semibold text-muted-foreground pt-0.5">
                  Итого должно быть: <span className="text-foreground">{seoStatus.breakdown.total_expected}</span> URL
                </div>
              </div>
            )}
            {/* Предупреждение о расхождении кэша и реальных данных */}
            {seoStatus.breakdown && seoStatus.sitemap_urls_count !== undefined &&
              seoStatus.sitemap_urls_count < seoStatus.breakdown.total_expected && (
              <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                <Icon name="AlertCircle" size={11} className="mt-0.5 shrink-0" />
                В базе {seoStatus.breakdown.total_expected} страниц, в карте {seoStatus.sitemap_urls_count}. Нажмите «Перестроить».
              </div>
            )}
            {/* Дата обновления кэша */}
            {seoStatus.sitemap_updated_at && (
              <div className="text-[10px] text-muted-foreground">
                Обновлён: {fmtDate(seoStatus.sitemap_updated_at)}
              </div>
            )}
            {/* Ссылка на файл */}
            {seoStatus.sitemap_url && (
              <a href={seoStatus.sitemap_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-brand-blue hover:underline">
                <Icon name="ExternalLink" size={10} /> {seoStatus.sitemap_url}
              </a>
            )}
          </div>
        )}
        <button
          onClick={rebuildSitemap}
          disabled={rebuilding}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name={rebuilding ? 'Loader2' : 'RefreshCw'} size={12} className={rebuilding ? 'animate-spin' : ''} />
          {rebuilding ? 'Перестройка...' : 'Перестроить'}
        </button>
      </div>
    </div>


  </div>
    </>
  );
}
