import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Deal } from '../crmKanbanTypes';

const PAGE_SIZE = 10;

const fmtMoney = (n: number) => {
  if (!n) return '0 ₽';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
  return `${n.toLocaleString('ru')} ₽`;
};

interface Props {
  isLoading: boolean;
  deals: Deal[];
  onCardClick: (id: number) => void;
}

export default function CrmDealsList({ isLoading, deals, onCardClick }: Props) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(deals.length / PAGE_SIZE));

  // Если список изменился (фильтр/поиск) и текущая страница вышла за пределы — сбрасываем
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-10 text-center text-muted-foreground">
        Сделок не найдено
      </div>
    );
  }

  const start = (page - 1) * PAGE_SIZE;
  const pageDeals = deals.slice(start, start + PAGE_SIZE);

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <div className="space-y-2">
        {pageDeals.map(d => (
          <button
            key={d.id}
            onClick={() => onCardClick(d.id)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-brand-blue/[0.04] hover:border-brand-blue/30 transition cursor-pointer"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{d.title}</span>
                {d.stage_name && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: d.stage_color || '#64748b' }}
                  >
                    {d.stage_name}
                  </span>
                )}
                {d.is_overdue && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                    просрочена
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                {d.assignee_name && <span className="inline-flex items-center gap-1"><Icon name="User" size={11} />{d.assignee_name}</span>}
                {d.owner_name && <span className="inline-flex items-center gap-1"><Icon name="UserCircle" size={11} />{d.owner_name}</span>}
                {d.listing_title && <span className="inline-flex items-center gap-1 truncate"><Icon name="Building2" size={11} />{d.listing_title}</span>}
                {d.created_at && <span className="inline-flex items-center gap-1"><Icon name="Calendar" size={11} />{new Date(d.created_at).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-sm font-display">{fmtMoney(d.amount || 0)}</div>
              {d.commission ? (
                <div className="text-[11px] text-brand-orange">комиссия {fmtMoney(d.commission)}</div>
              ) : null}
            </div>
            <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-40"
          >
            <Icon name="ChevronLeft" size={16} />
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-40"
          >
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
