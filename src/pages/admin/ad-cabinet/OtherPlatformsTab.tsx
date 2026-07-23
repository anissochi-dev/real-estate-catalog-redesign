import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { OTHER_PLATFORMS_API_URL, OtherPlatformRow } from './types';

const DEAL_LABEL: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export default function OtherPlatformsTab() {
  const [platforms, setPlatforms] = useState<OtherPlatformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch(OTHER_PLATFORMS_API_URL)
      .then(r => r.json())
      .then(d => setPlatforms(d.platforms || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon name="Loader2" size={24} className="animate-spin text-brand-blue" />
      </div>
    );
  }

  if (platforms.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8 text-center">
        <Icon name="LayoutGrid" size={28} className="text-muted-foreground mx-auto mb-2" />
        <div className="font-semibold mb-1">Площадок пока нет</div>
        <div className="text-sm text-muted-foreground">
          Добавьте площадку в разделе «Настройки → XML фиды» с площадкой «Разное» — она появится здесь автоматически.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
        <Icon name="Info" size={16} className="shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold mb-0.5">Универсальные бесплатные площадки</div>
          Сюда автоматически выгружаются все объекты с включённым флажком «Р» (Разное) в карточке объекта. Новые площадки добавляются в «Настройки → XML фиды».
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map(p => (
          <div key={p.slug} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-violet-50 text-violet-600 border-violet-200 flex-shrink-0">
                <Icon name="LayoutGrid" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-sm">{p.name}</div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    p.is_active ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-muted-foreground bg-muted border border-border'
                  }`}>
                    <Icon name={p.is_active ? 'CheckCircle2' : 'PauseCircle'} size={10} />
                    {p.is_active ? 'Активна' : 'Выключена'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {p.listings_count} объект{p.listings_count === 1 ? '' : p.listings_count < 5 ? 'а' : 'ов'} в выгрузке
                </div>
              </div>
              {p.cdn_url && (
                <a href={p.cdn_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-2 py-1.5 rounded-lg bg-muted hover:bg-muted/70 inline-flex items-center gap-1 shrink-0">
                  <Icon name="ExternalLink" size={12} /> XML
                </a>
              )}
            </div>

            <div className="px-5 py-3 border-b border-border">
              {p.supports_stats && p.stats ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-lg font-bold">{p.stats.views ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Просмотры</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold">{p.stats.calls ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Звонки</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold">{p.stats.leads ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Заявки</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Icon name="CircleSlash" size={13} />
                  Данные от площадки не передаются
                </div>
              )}
            </div>

            <button
              onClick={() => setOpenSlug(s => s === p.slug ? null : p.slug)}
              className="w-full px-5 py-2.5 text-xs font-semibold text-brand-blue hover:bg-muted/40 transition flex items-center justify-center gap-1.5"
            >
              <Icon name={openSlug === p.slug ? 'ChevronUp' : 'ChevronDown'} size={13} />
              {openSlug === p.slug ? 'Скрыть список объектов' : `Показать объекты (${p.listings_count})`}
            </button>

            {openSlug === p.slug && (
              <div className="border-t border-border max-h-80 overflow-y-auto divide-y divide-border">
                {p.listings.length === 0 ? (
                  <div className="px-5 py-4 text-xs text-muted-foreground text-center">
                    Нет объектов с флажком «Р» — включите его в карточке объекта.
                  </div>
                ) : p.listings.map(l => (
                  <a key={l.id} href={`/object/${l.id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-5 py-2 hover:bg-muted/30 transition">
                    <img src={l.image || ''} alt="" className="w-9 h-9 rounded-lg object-cover bg-muted flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{l.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {DEAL_LABEL[l.deal || ''] || l.deal} · {l.city}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}