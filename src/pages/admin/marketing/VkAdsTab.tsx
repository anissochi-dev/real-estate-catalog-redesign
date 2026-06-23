import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

const VK_ADS_URL = 'https://functions.poehali.dev/d995fba6-2780-433f-bc4f-a430321d60d8';

interface AdPlan {
  id: number; name: string; status: string;
  budget_limit?: number; budget_limit_day?: number;
  date_start?: string; date_end?: string;
  objective?: string; delivery?: string;
  synced_at?: string;
}

interface AdGroup {
  id: number; ad_plan_id: number; name: string; status: string;
  budget_limit?: number; budget_limit_day?: number; delivery?: string;
}

interface AdItem {
  id: number; ad_group_id: number; name: string; status: string; delivery?: string;
}

interface StatDay {
  stat_date: string; shows: number; clicks: number; spent: number;
}

interface StatByPlan {
  [entityId: number]: { shows: number; clicks: number; spent: number };
}

interface LastSync {
  synced_at?: string; plans_count?: number; groups_count?: number;
  ads_count?: number; stats_rows?: number;
}

interface Summary {
  plans_count: number; groups_count: number; ads_count: number;
  total_impressions: number; total_clicks: number;
  total_spent: number; ctr: number;
}

interface VkAdsData {
  ok: boolean;
  last_sync: LastSync;
  summary: Summary;
  plans: AdPlan[];
  groups: AdGroup[];
  ads: AdItem[];
  stats_by_plan: StatByPlan;
  stats_by_day: StatDay[];
  synced_now?: boolean;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Активна',        cls: 'bg-emerald-100 text-emerald-700' },
  blocked:  { label: 'Заблокирована',  cls: 'bg-red-100 text-red-700' },
  deleted:  { label: 'Удалена',        cls: 'bg-gray-100 text-gray-500' },
  archived: { label: 'В архиве',       cls: 'bg-amber-100 text-amber-700' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>;
}

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[#0077FF]/10 flex items-center justify-center flex-shrink-0">
        <Icon name={icon} size={18} className="text-[#0077FF]" />
      </div>
      <div className="min-w-0">
        <div className="font-display font-700 text-lg text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function MiniChart({ days }: { days: StatDay[] }) {
  if (!days.length) return null;
  const max = Math.max(...days.map(d => d.shows), 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {days.slice(-30).map((d, i) => (
        <div
          key={i}
          title={`${new Date(d.stat_date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}: ${d.shows.toLocaleString('ru')} показов`}
          className="flex-1 bg-[#0077FF]/30 hover:bg-[#0077FF] rounded-sm transition-colors cursor-pointer"
          style={{ height: `${Math.max(2, (d.shows / max) * 40)}px` }}
        />
      ))}
    </div>
  );
}

export default function VkAdsTab() {
  const [data, setData] = useState<VkAdsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${VK_ADS_URL}?sync=1` : VK_ADS_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к VK Ads'))
      .finally(() => { setLoading(false); setSyncing(false); });
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 h-20 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground text-center">Загружаем данные из VK Ads…</div>
      </div>
    );
  }

  if (error) {
    const isSetup = error.includes('не настроен');
    return (
      <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <Icon name="AlertCircle" size={24} className="text-red-500" />
        </div>
        <div className="font-semibold text-foreground">{isSetup ? 'VK Ads не подключён' : 'Ошибка подключения'}</div>
        <div className="text-sm text-muted-foreground max-w-sm">{error}</div>
        {isSetup && (
          <a href="/admin?section=settings&tab=integrations" className="text-xs text-[#0077FF] underline">
            Настройки → Интеграции → VK Ads
          </a>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { summary, plans, groups, ads, stats_by_day, stats_by_plan, last_sync } = data;
  const fmt = (n: number) => (n || 0).toLocaleString('ru');
  const fmtMoney = (n: number) => `${fmt(Math.round(n))} ₽`;
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtSyncDate = (s?: string) => s ? new Date(s).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'никогда';

  return (
    <div className="space-y-4">

      {/* Заголовок */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-[#0077FF] flex items-center justify-center flex-shrink-0">
            <Icon name="Megaphone" size={14} className="text-white" />
          </div>
          <span className="font-display font-700 text-base text-foreground">VK Ads</span>
          {last_sync?.synced_at && (
            <span className="text-xs text-muted-foreground">
              Синхронизировано: {fmtSyncDate(last_sync.synced_at)}
            </span>
          )}
          {data.synced_now && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Icon name="CheckCircle2" size={12} /> Только что обновлено
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#0077FF]/30 text-[#0077FF] hover:bg-[#0077FF]/5 transition-colors disabled:opacity-50"
          >
            <Icon name={syncing ? 'Loader' : 'RefreshCw'} size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
          <a
            href="https://ads.vk.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#0077FF] flex items-center gap-1 hover:opacity-80"
          >
            Открыть кабинет <Icon name="ExternalLink" size={12} />
          </a>
        </div>
      </div>

      {/* Сводка — 30 дней */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Показы" value={fmt(summary.total_impressions)} icon="Eye" sub="за 30 дней" />
        <StatCard label="Клики" value={fmt(summary.total_clicks)} icon="MousePointerClick" sub="за 30 дней" />
        <StatCard label="CTR" value={`${summary.ctr}%`} icon="TrendingUp" sub="кликабельность" />
        <StatCard label="Расход" value={fmtMoney(summary.total_spent)} icon="Wallet" sub="за 30 дней" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Рекл. планы" value={summary.plans_count} icon="FolderOpen" />
        <StatCard label="Группы" value={summary.groups_count} icon="Layers" />
        <StatCard label="Объявления" value={summary.ads_count} icon="FileText" />
      </div>

      {/* График по дням */}
      {stats_by_day.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="BarChart2" size={14} className="text-[#0077FF]" />
            <span className="font-semibold text-sm">Показы по дням</span>
            <span className="text-xs text-muted-foreground ml-auto">последние 30 дней</span>
          </div>
          <MiniChart days={stats_by_day} />
        </div>
      )}

      {/* Планы */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Icon name="FolderOpen" size={14} className="text-[#0077FF]" />
          <span className="font-semibold text-sm">Рекламные планы</span>
          <span className="text-xs text-muted-foreground ml-auto">{plans.length}</span>
        </div>
        {plans.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Планы не найдены — создайте первую кампанию в VK Ads
          </div>
        ) : (
          <div className="divide-y divide-border">
            {plans.map(p => {
              const ps = stats_by_plan[p.id];
              return (
                <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status={p.status} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        #{p.id}
                        {p.objective && ` · ${p.objective}`}
                        {p.date_start && ` · ${fmtDate(p.date_start)}${p.date_end ? ` – ${fmtDate(p.date_end)}` : ''}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0 space-y-0.5">
                    {p.budget_limit_day != null && <div>{fmtMoney(p.budget_limit_day)}/день</div>}
                    {p.budget_limit != null && <div>{fmtMoney(p.budget_limit)} лимит</div>}
                    {ps && <div className="text-[#0077FF]">{fmt(ps.shows)} пок. · {fmt(ps.clicks)} кл.</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Группы */}
      {groups.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Icon name="Layers" size={14} className="text-[#0077FF]" />
            <span className="font-semibold text-sm">Группы объявлений</span>
            <span className="text-xs text-muted-foreground ml-auto">{groups.length}</span>
          </div>
          <div className="divide-y divide-border">
            {groups.map(g => (
              <div key={g.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusBadge status={g.status} />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{g.name}</div>
                    <div className="text-[10px] text-muted-foreground">#{g.id} · план #{g.ad_plan_id}</div>
                  </div>
                </div>
                {g.budget_limit_day != null && (
                  <div className="text-xs text-muted-foreground shrink-0">{fmtMoney(g.budget_limit_day)}/день</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Объявления */}
      {ads.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Icon name="FileText" size={14} className="text-[#0077FF]" />
            <span className="font-semibold text-sm">Объявления</span>
            <span className="text-xs text-muted-foreground ml-auto">{ads.length}</span>
          </div>
          <div className="divide-y divide-border">
            {ads.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-center gap-2">
                <StatusBadge status={a.status} />
                <span className="font-medium text-sm truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-auto">#{a.id} · группа #{a.ad_group_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Пусто */}
      {plans.length === 0 && groups.length === 0 && ads.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <Icon name="Megaphone" size={36} className="text-muted-foreground/20 mx-auto mb-3" />
          <div className="font-semibold text-foreground mb-1">Рекламных кампаний пока нет</div>
          <div className="text-sm text-muted-foreground mb-3">Создайте первую кампанию в VK Ads — она появится здесь автоматически</div>
          <a href="https://ads.vk.com" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[#0077FF] underline">
            Открыть VK Ads <Icon name="ExternalLink" size={13} />
          </a>
        </div>
      )}
    </div>
  );
}
