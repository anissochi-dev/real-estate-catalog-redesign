import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

const VK_ADS_URL = 'https://functions.poehali.dev/d995fba6-2780-433f-bc4f-a430321d60d8';

interface AdPlan {
  id: number; name: string; status: string;
  budget?: number; budget_lifetime?: number;
  start_time?: string; stop_time?: string;
}

interface AdGroup {
  id: number; ad_plan_id: number; name: string; status: string; budget?: number;
}

interface Ad {
  id: number; ad_group_id: number; name: string; status: string;
}

interface Summary {
  plans_count: number; groups_count: number; ads_count: number;
  total_impressions: number; total_clicks: number;
  total_spent: number; ctr: number;
}

interface VkAdsData {
  ok: boolean;
  date_from: string; date_to: string;
  summary: Summary;
  plans: { items?: AdPlan[] } | null;
  groups: { items?: AdGroup[] } | null;
  ads: { items?: Ad[] } | null;
  stats_plans: unknown;
  stats_groups: unknown;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Активна',   cls: 'bg-emerald-100 text-emerald-700' },
  blocked:  { label: 'Заблокирована', cls: 'bg-red-100 text-red-700' },
  deleted:  { label: 'Удалена',   cls: 'bg-gray-100 text-gray-500' },
  archived: { label: 'В архиве',  cls: 'bg-amber-100 text-amber-700' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[#0077FF]/10 flex items-center justify-center flex-shrink-0">
        <Icon name={icon} size={18} className="text-[#0077FF]" />
      </div>
      <div>
        <div className="font-display font-700 text-lg text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function VkAdsTab() {
  const [data, setData] = useState<VkAdsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(VK_ADS_URL)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Не удалось подключиться к VK Ads'))
      .finally(() => setLoading(false));
  }, []);

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
          <a
            href="/admin?section=settings&tab=integrations"
            className="mt-1 text-xs text-[#0077FF] underline underline-offset-2"
          >
            Перейти в Настройки → Интеграции
          </a>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { summary, plans, groups, ads, date_from, date_to } = data;
  const planItems = plans?.items ?? [];
  const groupItems = groups?.items ?? [];
  const adItems = ads?.items ?? [];

  const fmt = (n: number) => n.toLocaleString('ru');
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-4">

      {/* Заголовок */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0077FF] flex items-center justify-center">
            <Icon name="Megaphone" size={14} className="text-white" />
          </div>
          <span className="font-display font-700 text-base text-foreground">VK Ads</span>
          <span className="text-xs text-muted-foreground">
            {fmtDate(date_from)} — {fmtDate(date_to)}
          </span>
        </div>
        <a
          href="https://ads.vk.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#0077FF] flex items-center gap-1 hover:opacity-80"
        >
          Открыть кабинет <Icon name="ExternalLink" size={12} />
        </a>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Показы" value={fmt(summary.total_impressions)} icon="Eye" sub="за 30 дней" />
        <StatCard label="Клики" value={fmt(summary.total_clicks)} icon="MousePointerClick" sub="за 30 дней" />
        <StatCard label="CTR" value={`${summary.ctr}%`} icon="TrendingUp" sub="кликабельность" />
        <StatCard label="Расход" value={`${fmt(summary.total_spent)} ₽`} icon="Wallet" sub="за 30 дней" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Рекл. планы" value={summary.plans_count} icon="FolderOpen" />
        <StatCard label="Группы" value={summary.groups_count} icon="Layers" />
        <StatCard label="Объявления" value={summary.ads_count} icon="FileText" />
      </div>

      {/* Планы */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Icon name="FolderOpen" size={15} className="text-[#0077FF]" />
          <span className="font-semibold text-sm">Рекламные планы</span>
          <span className="text-xs text-muted-foreground ml-auto">{planItems.length}</span>
        </div>
        {planItems.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">Планы не найдены</div>
        ) : (
          <div className="divide-y divide-border">
            {planItems.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusBadge status={p.status} />
                  <span className="font-medium truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">#{p.id}</span>
                </div>
                <div className="text-right shrink-0">
                  {p.budget != null && (
                    <div className="text-xs text-muted-foreground">{fmt(p.budget)} ₽/день</div>
                  )}
                  {p.budget_lifetime != null && (
                    <div className="text-xs text-muted-foreground">{fmt(p.budget_lifetime)} ₽ всего</div>
                  )}
                  {p.start_time && (
                    <div className="text-[10px] text-muted-foreground/60">
                      {fmtDate(p.start_time)}{p.stop_time ? ` – ${fmtDate(p.stop_time)}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Группы */}
      {groupItems.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Icon name="Layers" size={15} className="text-[#0077FF]" />
            <span className="font-semibold text-sm">Рекламные группы</span>
            <span className="text-xs text-muted-foreground ml-auto">{groupItems.length}</span>
          </div>
          <div className="divide-y divide-border">
            {groupItems.map(g => (
              <div key={g.id} className="px-4 py-3 flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusBadge status={g.status} />
                  <span className="font-medium truncate">{g.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">#{g.id}</span>
                </div>
                {g.budget != null && (
                  <div className="text-xs text-muted-foreground shrink-0">{fmt(g.budget)} ₽</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Объявления */}
      {adItems.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Icon name="FileText" size={15} className="text-[#0077FF]" />
            <span className="font-semibold text-sm">Объявления</span>
            <span className="text-xs text-muted-foreground ml-auto">{adItems.length}</span>
          </div>
          <div className="divide-y divide-border">
            {adItems.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-center gap-2 text-sm">
                <StatusBadge status={a.status} />
                <span className="font-medium truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-auto">#{a.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Пусто */}
      {planItems.length === 0 && groupItems.length === 0 && adItems.length === 0 && (
        <div className="bg-white rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          <Icon name="Megaphone" size={32} className="text-muted-foreground/30 mx-auto mb-2" />
          Рекламных кампаний в кабинете пока нет
        </div>
      )}
    </div>
  );
}
