import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { PhotoResult, S3Result, XmlResult, XmlQualityResult, CleanAction } from './siteHealthTypes';

interface PhotoSectionProps {
  photos: PhotoResult | null;
  photoLoading: boolean;
  loadPhotos: () => void;
  running: string | null;
  runAction: (action: CleanAction) => void;
  fixBrokenPhotosAction: CleanAction;
}

export function PhotoSection({ photos, photoLoading, loadPhotos, running, runAction, fixBrokenPhotosAction }: PhotoSectionProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Icon name="ImageOff" size={18} className="text-brand-blue" /> Проверка фотографий
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Проверяет внешние фото объявлений на доступность (выборка 30 шт)</p>
        </div>
        <button onClick={loadPhotos} disabled={photoLoading}
          className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          <Icon name={photoLoading ? 'Loader2' : 'ScanSearch'} size={16} className={photoLoading ? 'animate-spin' : ''} />
          {photoLoading ? 'Проверка…' : 'Проверить'}
        </button>
      </div>
      {photos && (
        <div className="space-y-3">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${photos.broken_count === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <Icon name={photos.broken_count === 0 ? 'CheckCircle2' : 'AlertCircle'} size={22}
              className={photos.broken_count === 0 ? 'text-emerald-500' : 'text-amber-500'} />
            <div>
              <div className="font-semibold text-sm">{photos.message}</div>
              <div className="text-xs text-muted-foreground">Доступных: {photos.ok_count} · Битых: {photos.broken_count}</div>
            </div>
          </div>
          {photos.broken.length > 0 && (
            <div className="grid gap-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Битые фото</div>
              {photos.broken.map((b, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs">
                  <Icon name="ImageOff" size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="font-semibold text-red-700">Объявление #{b.id}</span>
                    <div className="text-muted-foreground truncate">{b.url}</div>
                    <div className="text-red-500">{b.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {photos.broken_count > 0 && (
            <button onClick={() => runAction(fixBrokenPhotosAction)}
              disabled={!!running}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <Icon name={running === 'fix_broken_photos' ? 'Loader2' : 'Trash2'} size={15} className={running === 'fix_broken_photos' ? 'animate-spin' : ''} />
              Удалить все битые фото из объявлений
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface S3SectionProps {
  s3: S3Result | null;
  s3Loading: boolean;
  loadS3: () => void;
}

export function S3Section({ s3, s3Loading, loadS3 }: S3SectionProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Icon name="HardDrive" size={18} className="text-brand-blue" /> Хранилище S3 / CDN
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Количество файлов и занятое место по папкам</p>
        </div>
        <button onClick={loadS3} disabled={s3Loading}
          className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          <Icon name={s3Loading ? 'Loader2' : 'RefreshCw'} size={16} className={s3Loading ? 'animate-spin' : ''} />
          {s3Loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>
      {s3 && (
        <div className="space-y-3">
          {(s3 as { source?: string }).source === 'db' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-xl text-xs text-muted-foreground border border-border">
              <Icon name="Info" size={13} />
              Статистика по данным из базы — размер файлов недоступен
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(s3 as { source?: string }).source !== 'db' && (
              <div className="p-4 bg-brand-blue/5 border border-brand-blue/20 rounded-xl text-center">
                <div className="text-2xl font-bold text-brand-blue">{s3.total_size_human}</div>
                <div className="text-xs text-muted-foreground mt-1">Занято места</div>
              </div>
            )}
            <div className={`p-4 bg-brand-blue/5 border border-brand-blue/20 rounded-xl text-center ${ (s3 as { source?: string }).source === 'db' ? 'col-span-2' : '' }`}>
              <div className="text-2xl font-bold text-brand-blue">{Number(s3.total_files || 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">Файлов в хранилище</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">По папкам</div>
            <div className="grid gap-2">
              {Object.entries(s3.folders || {}).map(([folder, count]) => (
                <div key={folder} className="flex items-center justify-between px-4 py-2.5 bg-muted/30 rounded-xl border border-border text-sm">
                  <div className="flex items-center gap-2">
                    <Icon name="Folder" size={14} className="text-muted-foreground" />
                    <span className="font-mono text-xs">{folder}/</span>
                  </div>
                  <span className="font-semibold">{Number(count || 0).toLocaleString()} файлов</span>
                </div>
              ))}
            </div>
          </div>
          <div className="px-3 py-2.5 bg-muted/30 rounded-xl border border-border">
            <div className="text-xs text-muted-foreground mb-1">CDN адрес</div>
            <div className="text-xs font-mono text-foreground/70 break-all">{s3.cdn_base}</div>
          </div>
        </div>
      )}
    </div>
  );
}

interface XmlSectionProps {
  xml: XmlResult | null;
  xmlLoading: boolean;
  loadXml: () => void;
  xmlQuality: XmlQualityResult | null;
  xmlQualityLoading: boolean;
  loadXmlQuality: () => void;
}

export function XmlSection({ xml, xmlLoading, loadXml, xmlQuality, xmlQualityLoading, loadXmlQuality }: XmlSectionProps) {
  const [tab, setTab] = useState<'feeds' | 'quality'>('feeds');
  const [showAll, setShowAll] = useState(false);

  const openListing = (id: number) => {
    window.dispatchEvent(new CustomEvent('admin:open-listing', { detail: id }));
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Icon name="Rss" size={18} className="text-brand-blue" /> XML-фиды
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">Авито, ЦИАН — доступность и качество данных</p>
        </div>
        <div className="flex gap-2">
          {tab === 'feeds' && (
            <button onClick={loadXml} disabled={xmlLoading}
              className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={xmlLoading ? 'Loader2' : 'Rss'} size={15} className={xmlLoading ? 'animate-spin' : ''} />
              {xmlLoading ? 'Проверка…' : 'Проверить'}
            </button>
          )}
          {tab === 'quality' && (
            <button onClick={loadXmlQuality} disabled={xmlQualityLoading}
              className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={xmlQualityLoading ? 'Loader2' : 'ScanSearch'} size={15} className={xmlQualityLoading ? 'animate-spin' : ''} />
              {xmlQualityLoading ? 'Анализ…' : 'Проверить'}
            </button>
          )}
        </div>
      </div>

      {/* Таб-переключатель */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
        {(['feeds', 'quality'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${tab === t ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'feeds' ? 'Доступность фидов' : 'Качество объектов'}
          </button>
        ))}
      </div>
      {/* ТАБ: Доступность фидов */}
      {tab === 'feeds' && xml && (
        <div className="space-y-3">
          {(() => {
            const realErrors = xml.feeds.filter(f => !f.ok && !f.error?.includes('402'));
            const inactive = xml.feeds.filter(f => !f.ok && f.error?.includes('402'));
            const allInactive = !xml.all_ok && realErrors.length === 0;
            return (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                xml.all_ok ? 'bg-emerald-50 border-emerald-200'
                : allInactive ? 'bg-muted/50 border-border'
                : 'bg-amber-50 border-amber-200'
              }`}>
                <Icon
                  name={xml.all_ok ? 'CheckCircle2' : allInactive ? 'Info' : 'AlertCircle'}
                  size={20}
                  className={xml.all_ok ? 'text-emerald-500' : allInactive ? 'text-muted-foreground' : 'text-amber-500'}
                />
                <div className="text-sm">
                  <div className="font-semibold">
                    {xml.all_ok ? `Все ${xml.checked} фидов работают`
                      : allInactive ? 'Фиды не подключены'
                      : 'Есть проблемы в фидах'}
                  </div>
                  {allInactive && inactive.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      XML-фиды для Авито и ЦИАН требуют активации тарифа
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="grid gap-2">
            {xml.feeds.map((f, i) => {
              const is402 = !f.ok && f.error?.includes('402');
              return (
                <div key={i} className={`px-4 py-3 rounded-xl border text-sm ${
                  f.ok ? 'bg-emerald-50/50 border-emerald-200'
                  : is402 ? 'bg-muted/30 border-border'
                  : 'bg-red-50/50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Icon
                        name={f.ok ? 'CheckCircle2' : is402 ? 'CircleDashed' : 'XCircle'}
                        size={15}
                        className={f.ok ? 'text-emerald-500' : is402 ? 'text-muted-foreground' : 'text-red-500'}
                      />
                      <span className="font-semibold">{f.name}</span>
                      {is402 && <span className="text-xs text-muted-foreground font-normal">не активирован</span>}
                    </div>
                    {f.ok && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {f.items !== undefined && <span>{f.items} элементов</span>}
                        {f.size_kb !== undefined && <span>{f.size_kb} КБ</span>}
                        {f.root_tag && <span className="font-mono">&lt;{f.root_tag}&gt;</span>}
                      </div>
                    )}
                  </div>
                  {f.error && !is402 && <div className="text-xs text-red-600 mt-1.5 ml-5">{f.error}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ТАБ: Качество объектов */}
      {tab === 'quality' && !xmlQuality && !xmlQualityLoading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Icon name="ClipboardCheck" size={32} className="mx-auto mb-3 opacity-30" />
          Нажмите «Проверить» чтобы проанализировать заполненность объектов для экспорта
        </div>
      )}
      {tab === 'quality' && xmlQualityLoading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Icon name="Loader2" size={24} className="mx-auto mb-2 animate-spin" />
          Анализ объектов...
        </div>
      )}
      {tab === 'quality' && xmlQuality && !xmlQualityLoading && (
        <div className="space-y-4">
          {/* Итоговая статистика */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            xmlQuality.issues_count === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <Icon
              name={xmlQuality.issues_count === 0 ? 'CheckCircle2' : 'AlertCircle'}
              size={20}
              className={xmlQuality.issues_count === 0 ? 'text-emerald-500' : 'text-amber-500'}
            />
            <div className="text-sm">
              <div className="font-semibold">
                {xmlQuality.issues_count === 0
                  ? `Все ${xmlQuality.total} объектов заполнены полностью`
                  : `${xmlQuality.issues_count} из ${xmlQuality.total} объектов требуют доработки`}
              </div>
              {xmlQuality.perfect > 0 && xmlQuality.issues_count > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {xmlQuality.perfect} объектов заполнены полностью
                </div>
              )}
            </div>
          </div>

          {/* Сводка по полям */}
          {xmlQuality.field_summary.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Чего не хватает чаще всего</div>
              <div className="grid gap-1.5">
                {xmlQuality.field_summary.map(f => (
                  <div key={f.key} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border text-sm">
                    <div className="flex-1 font-medium">{f.label}</div>
                    <div className="text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
                      {f.count} объектов
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Список объектов с проблемами */}
          {xmlQuality.issues.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Объекты с незаполненными полями
              </div>
              <div className="grid gap-2">
                {(showAll ? xmlQuality.issues : xmlQuality.issues.slice(0, 10)).map(issue => (
                  <div key={issue.id} className="flex items-start gap-3 px-3 py-2.5 bg-white border border-border rounded-xl text-sm hover:border-brand-blue/40 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{issue.title}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {issue.missing.map(m => (
                          <span key={m} className="text-xs px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => openListing(issue.id)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-blue/10 text-brand-blue text-xs font-semibold hover:bg-brand-blue/20 transition"
                    >
                      <Icon name="Pencil" size={12} />
                      Открыть
                    </button>
                  </div>
                ))}
              </div>
              {xmlQuality.issues.length > 10 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="mt-2 w-full py-2 text-xs font-semibold text-brand-blue hover:underline"
                >
                  {showAll ? 'Скрыть' : `Показать ещё ${xmlQuality.issues.length - 10}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}