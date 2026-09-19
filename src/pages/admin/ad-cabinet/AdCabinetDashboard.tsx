import { ReactNode, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import PlatformIcon from '@/components/admin/PlatformIcon';
import { AVITO_API_URL, AvitoData, CIAN_API_URL, CianData, DOMCLICK_API_URL, DomclickData, OTHER_PLATFORMS_API_URL, OtherPlatformRow, PlatformCard, SERVICE_TYPE_LABELS, YANDEX_CALLS_API_URL, YandexCallsData, YOULA_API_URL, YoulaData } from './types';

interface Props {
  onOpenPlatform: (key: string) => void;
}

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  cian: { label: 'ЦИАН', icon: 'Building2', color: 'bg-sky-100 text-sky-600' },
  avito: { label: 'Авито', icon: 'ShoppingBag', color: 'bg-emerald-100 text-emerald-600' },
  yandex_realty: { label: 'Яндекс.Недвижимость', icon: 'Home', color: 'bg-red-100 text-red-600' },
  domclick: { label: 'ДомКлик', icon: 'MousePointer', color: 'bg-blue-100 text-blue-600' },
  youla: { label: 'Юла', icon: 'ShoppingCart', color: 'bg-violet-100 text-violet-600' },
};

const PLATFORM_ORDER = ['avito', 'yandex_realty', 'cian', 'domclick', 'youla'];

function MiniStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="bg-muted/50 rounded-lg px-2 py-1.5">
      <div className="text-sm font-bold leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function PlatformCardView({ card, onClick }: { card: PlatformCard; onClick: () => void }) {
  const meta = PLATFORM_META[card.key];
  const statusMeta = {
    active: { label: 'Активен', cls: 'bg-emerald-100 text-emerald-700' },
    paused: { label: 'Пауза', cls: 'bg-amber-100 text-amber-700' },
    not_connected: { label: 'Не подключено', cls: 'bg-muted text-muted-foreground' },
  }[card.status];

  return (
    <div
      onClick={card.connected ? onClick : undefined}
      className={`bg-white rounded-2xl border border-border p-4 flex flex-col gap-2 transition ${
        card.connected ? 'cursor-pointer hover:border-brand-blue hover:shadow-sm' : 'opacity-70'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${meta.color}`}>
          <PlatformIcon platform={card.key} icon={meta.icon} size={18} />
        </div>
        <div className="font-semibold text-sm">{meta.label}</div>
      </div>
      {card.connected ? (
        <>
          <div className="text-xs text-muted-foreground">
            {card.key === 'yandex_realty'
              ? `${card.callsCount || 0} звонков за 30 дней`
              : `${card.offersCount} объявл.${card.balance !== null ? ` · ${card.balance.toLocaleString('ru')} ₽` : ''}`}
          </div>

          {card.key === 'cian' && card.cianExtra && (
            <div className="grid grid-cols-2 gap-1.5 mt-0.5">
              <MiniStat value={card.cianExtra.totalViews.toLocaleString('ru')} label="Просмотры" />
              <MiniStat value={card.cianExtra.totalCalls.toLocaleString('ru')} label="Звонки" />
              <MiniStat value={card.cianExtra.totalFavorites.toLocaleString('ru')} label="В избранном" />
              <MiniStat value={card.cianExtra.archivedCount.toLocaleString('ru')} label="В архиве" />
            </div>
          )}

          {card.key === 'avito' && card.avitoExtra && (
            <div className="grid grid-cols-2 gap-1.5 mt-0.5">
              <MiniStat value={card.avitoExtra.totalViews.toLocaleString('ru')} label="Просмотры" />
              <MiniStat value={card.avitoExtra.totalContacts.toLocaleString('ru')} label="Обращения" />
              <MiniStat value={card.avitoExtra.totalFavorites.toLocaleString('ru')} label="В избранном" />
              <MiniStat value={`${card.avitoExtra.balanceBonus.toLocaleString('ru')} ₽`} label="Бонусный счёт" />
            </div>
          )}

          {card.key === 'yandex_realty' && card.yandexExtra && (
            <div className="grid grid-cols-2 gap-1.5 mt-0.5">
              <MiniStat value={card.yandexExtra.totalShows.toLocaleString('ru')} label="Показов за 30 дн." />
              <MiniStat value={card.yandexExtra.offersAccepted.toLocaleString('ru')} label={`Принято из ${card.yandexExtra.offersTotal}`} />
              {card.yandexExtra.offersDeclined > 0 && (
                <MiniStat value={<span className="text-red-600">{card.yandexExtra.offersDeclined}</span>} label="Отклонено фидом" />
              )}
              {card.yandexExtra.withErrors > 0 && (
                <MiniStat value={<span className="text-red-600">{card.yandexExtra.withErrors}</span>} label="С ошибками" />
              )}
            </div>
          )}

          {card.key === 'domclick' && card.domclickExtra && (
            <div className="grid grid-cols-2 gap-1.5 mt-0.5">
              <MiniStat value={card.domclickExtra.totalViews.toLocaleString('ru')} label="Просмотры" />
              <MiniStat value={card.domclickExtra.totalSearchShows.toLocaleString('ru')} label="Показы в поиске" />
              <MiniStat value={card.domclickExtra.totalPhoneShows.toLocaleString('ru')} label="Показы телефона" />
              <MiniStat value={`${card.domclickExtra.totalChatsAnswered}/${card.domclickExtra.totalChats}`} label="Чаты (отвечено)" />
              <MiniStat value={card.domclickExtra.totalFavorites.toLocaleString('ru')} label="В избранном" />
              <MiniStat value={card.domclickExtra.publishedCount.toLocaleString('ru')} label="Опубликовано" />
            </div>
          )}

          {card.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {card.services.map(s => (
                <span key={s.label} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          )}

          {card.key === 'cian' && card.cianExtra && (card.cianExtra.bonusesAmount > 0 || card.cianExtra.auctionPointsAmount > 0) && (
            <div className="text-[10px] text-muted-foreground">
              {card.cianExtra.bonusesAmount > 0 && <>Бонусы: {card.cianExtra.bonusesAmount.toLocaleString('ru')} ₽</>}
              {card.cianExtra.bonusesAmount > 0 && card.cianExtra.auctionPointsAmount > 0 && <> · </>}
              {card.cianExtra.auctionPointsAmount > 0 && <>Баллы аукциона: {card.cianExtra.auctionPointsAmount.toLocaleString('ru')}</>}
            </div>
          )}

          {card.key === 'cian' && card.cianExtra?.syncedAt && (
            <div className="text-[10px] text-muted-foreground/70">
              Обновлено {new Date(card.cianExtra.syncedAt).toLocaleString('ru')}
            </div>
          )}

          {card.key === 'avito' && card.avitoExtra?.reportStatusLabel && (
            <div className="text-[10px] text-muted-foreground">
              Автозагрузка: {card.avitoExtra.reportStatusLabel}
              {card.avitoExtra.reportTotalAds !== null && <> · {card.avitoExtra.reportTotalAds} объявл.</>}
            </div>
          )}
          {card.key === 'avito' && card.avitoExtra?.reportFinishedAt && (
            <div className="text-[10px] text-muted-foreground/70">
              Обновлено {new Date(card.avitoExtra.reportFinishedAt).toLocaleString('ru')}
            </div>
          )}

          {card.key === 'domclick' && card.domclickExtra?.syncedAt && (
            <div className="text-[10px] text-muted-foreground/70">
              Обновлено {new Date(card.domclickExtra.syncedAt).toLocaleString('ru')}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-muted-foreground truncate" title={card.errorReason || undefined}>
          {card.errorReason ? `Ошибка подключения: ${card.errorReason}` : 'Ключ API не настроен'}
        </div>
      )}
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${statusMeta.cls}`}>
        <Icon name={card.status === 'active' ? 'CheckCircle2' : card.status === 'paused' ? 'PauseCircle' : 'Circle'} size={10} />
        {statusMeta.label}
      </span>
    </div>
  );
}

function OtherPlatformCardView({ platforms, onClick }: { platforms: OtherPlatformRow[]; onClick: () => void }) {
  const totalListings = platforms[0]?.listings_count ?? 0;
  const activeCount = platforms.filter(p => p.is_active).length;
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-2 transition cursor-pointer hover:border-brand-blue hover:shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-violet-100 text-violet-600">
          <Icon name="LayoutGrid" size={18} />
        </div>
        <div className="font-semibold text-sm">Разное</div>
      </div>
      <div className="text-xs text-muted-foreground">
        {platforms.length} площад{platforms.length === 1 ? 'ка' : platforms.length < 5 ? 'ки' : 'ок'} · {totalListings} объявл.
      </div>
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${
        activeCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
      }`}>
        <Icon name={activeCount > 0 ? 'CheckCircle2' : 'Circle'} size={10} />
        {activeCount > 0 ? `Активно: ${activeCount}` : 'Нет площадок'}
      </span>
    </div>
  );
}

export default function AdCabinetDashboard({ onOpenPlatform }: Props) {
  const [cian, setCian] = useState<CianData | null>(null);
  const [yandex, setYandex] = useState<YandexCallsData | null>(null);
  const [avito, setAvito] = useState<AvitoData | null>(null);
  const [youla, setYoula] = useState<YoulaData | null>(null);
  const [domclick, setDomclick] = useState<DomclickData | null>(null);
  const [otherPlatforms, setOtherPlatforms] = useState<OtherPlatformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const cianUrl = sync ? `${CIAN_API_URL}&sync=1` : CIAN_API_URL;
    const yandexUrl = sync ? `${YANDEX_CALLS_API_URL}&sync=1` : YANDEX_CALLS_API_URL;
    const avitoUrl = sync ? `${AVITO_API_URL}&sync=1` : AVITO_API_URL;
    const youlaUrl = sync ? `${YOULA_API_URL}&sync=1` : YOULA_API_URL;
    const domclickUrl = sync ? `${DOMCLICK_API_URL}&sync=1` : DOMCLICK_API_URL;
    Promise.all([
      fetch(cianUrl).then(r => r.json()).catch(() => ({ error: 'network' })),
      fetch(yandexUrl).then(r => r.json()).catch(() => ({ error: 'network' })),
      fetch(avitoUrl).then(r => r.json()).catch(() => ({ error: 'network' })),
      fetch(OTHER_PLATFORMS_API_URL).then(r => r.json()).catch(() => ({ platforms: [] })),
      fetch(youlaUrl).then(r => r.json()).catch(() => ({ error: 'network' })),
      fetch(domclickUrl).then(r => r.json()).catch(() => ({ error: 'network' })),
    ]).then(([cianData, yandexData, avitoData, otherData, youlaData, domclickData]) => {
      if (cianData.error) { setError(cianData.error); setCian(null); }
      else { setCian(cianData); setError(null); }
      if (!yandexData.error) setYandex(yandexData);
      else setYandex(null);
      if (!avitoData.error) setAvito(avitoData);
      else setAvito(null);
      if (!youlaData.error) setYoula(youlaData);
      else setYoula(null);
      if (!domclickData.error) setDomclick(domclickData);
      else setDomclick(null);
      setOtherPlatforms(otherData.platforms || []);
    }).finally(() => { setLoading(false); setSyncing(false); });
  };

  useEffect(() => { load(); }, []);

  const platforms: PlatformCard[] = PLATFORM_ORDER.map(key => {
    if (key === 'cian' && cian && !error) {
      const servicesEntries = Object.entries(cian.summary.services_by_type || {})
        .filter(([type]) => type !== 'FreeObject')
        .map(([type, count]) => ({ label: SERVICE_TYPE_LABELS[type] || type, count }));
      return {
        key, label: 'ЦИАН', icon: '', color: '',
        connected: true,
        offersCount: cian.summary.offers_count,
        balance: cian.balance?.total_balance ? Number(cian.balance.total_balance) : 0,
        status: cian.summary.published_count > 0 ? 'active' : 'paused',
        services: servicesEntries,
        cianExtra: {
          publishedCount: cian.summary.published_count || 0,
          totalViews: cian.summary.total_views || 0,
          totalCalls: cian.summary.total_calls || 0,
          totalFavorites: cian.summary.total_favorites || 0,
          archivedCount: cian.summary.archived_count || 0,
          bonusesAmount: cian.balance?.bonuses_amount ? Number(cian.balance.bonuses_amount) : 0,
          auctionPointsAmount: cian.balance?.auction_points_amount ? Number(cian.balance.auction_points_amount) : 0,
          syncedAt: cian.last_sync?.synced_at || null,
        },
      };
    }
    if (key === 'yandex_realty' && yandex) {
      const connected = !yandex.last_sync?.error;
      return {
        key, label: 'Яндекс.Недвижимость', icon: '', color: '',
        connected,
        offersCount: yandex.summary.unique_objects,
        balance: null,
        status: connected ? (yandex.summary.total_shows > 0 ? 'active' : 'paused') : 'not_connected',
        services: [],
        callsCount: yandex.summary.total_calls,
        errorReason: !connected ? yandex.last_sync?.error : null,
        yandexExtra: connected ? {
          offersTotal: yandex.last_sync?.offers_total || 0,
          offersAccepted: yandex.last_sync?.offers_accepted || 0,
          offersDeclined: yandex.last_sync?.offers_declined || 0,
          totalShows: yandex.summary.total_shows || 0,
          withErrors: yandex.summary.with_errors || 0,
        } : undefined,
      };
    }
    if (key === 'avito' && avito) {
      const connected = avito.connected && !avito.last_sync?.error;
      const totalViews = avito.items?.reduce((a, i) => a + (i.uniq_views || 0), 0) || 0;
      const totalContacts = avito.items?.reduce((a, i) => a + (i.uniq_contacts || 0), 0) || 0;
      const totalFavorites = avito.items?.reduce((a, i) => a + (i.uniq_favorites || 0), 0) || 0;
      return {
        key, label: 'Авито', icon: '', color: '',
        connected,
        offersCount: avito.items?.length || 0,
        balance: connected ? Number(avito.last_sync?.balance_real || 0) : null,
        status: connected ? 'active' : 'not_connected',
        services: [],
        errorReason: !connected ? (avito.last_sync?.error || null) : null,
        avitoExtra: connected ? {
          accountName: avito.last_sync?.account_name || null,
          balanceBonus: Number(avito.last_sync?.balance_bonus || 0),
          totalViews,
          totalContacts,
          totalFavorites,
          reportStatusLabel: avito.last_report?.status_label || null,
          reportTotalAds: avito.last_report?.total_ads ?? null,
          reportFinishedAt: avito.last_report?.finished_at || null,
        } : undefined,
      };
    }
    if (key === 'youla' && youla) {
      const connected = youla.connected && !youla.last_sync?.error;
      const publishedCount = youla.items?.filter(i => i.is_published).length || 0;
      return {
        key, label: 'Юла', icon: '', color: '',
        connected,
        offersCount: youla.items?.length || 0,
        balance: null,
        status: connected ? (publishedCount > 0 ? 'active' : 'paused') : 'not_connected',
        services: [],
        errorReason: !connected ? youla.last_sync?.error : null,
      };
    }
    if (key === 'domclick' && domclick) {
      const connected = domclick.connected && !domclick.last_sync?.error;
      const items = domclick.items || [];
      const publishedCount = items.filter(i => i.status === 'Опубликовано').length;
      return {
        key, label: 'ДомКлик', icon: '', color: '',
        connected,
        offersCount: items.length,
        balance: null,
        status: connected ? (publishedCount > 0 ? 'active' : 'paused') : 'not_connected',
        services: [],
        errorReason: !connected ? domclick.last_sync?.error : null,
        domclickExtra: connected ? {
          publishedCount,
          totalViews: items.reduce((a, i) => a + (i.views || 0), 0),
          totalSearchShows: items.reduce((a, i) => a + (i.search_shows || 0), 0),
          totalPhoneShows: items.reduce((a, i) => a + (i.phone_shows || 0), 0),
          totalChats: items.reduce((a, i) => a + (i.chats_total || 0), 0),
          totalChatsAnswered: items.reduce((a, i) => a + (i.chats_answered || 0), 0),
          totalFavorites: items.reduce((a, i) => a + (i.favorites || 0), 0),
          syncedAt: domclick.last_sync?.synced_at || null,
        } : undefined,
      };
    }
    return {
      key, label: PLATFORM_META[key].label, icon: '', color: '',
      connected: false, offersCount: 0, balance: null, status: 'not_connected', services: [],
    };
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Icon name="Megaphone" size={20} className="text-brand-blue" />
              Рекламный кабинет
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Сводка по всем площадкам размещения объектов
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name="RefreshCw" size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 h-20 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          {error && (
            <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-2 text-sm">
              <Icon name="AlertCircle" size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-600">ЦИАН: ошибка подключения</div>
                <div className="text-xs text-muted-foreground mt-0.5">{error}</div>
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Zap" size={15} className="text-brand-blue" /> Быстрые действия по площадкам
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {platforms.map(p => (
                <PlatformCardView key={p.key} card={p} onClick={() => onOpenPlatform(p.key)} />
              ))}
              <OtherPlatformCardView platforms={otherPlatforms} onClick={() => onOpenPlatform('other')} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}