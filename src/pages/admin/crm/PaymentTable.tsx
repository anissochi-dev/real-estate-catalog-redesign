import { UseMutationResult } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import {
  Payment, STATUS_INFO, REFUND_INFO,
  typeLabel, fmtMoney, fmtDate,
} from './paymentTypes';

interface Props {
  payments: Payment[];
  total: number;
  totalPages: number;
  page: number;
  isLoading: boolean;
  detailId: number | null;
  refundId: number | null;
  createdUrl: string | null;
  setPage: (p: number | ((prev: number) => number)) => void;
  setDetailId: (id: number | null) => void;
  setRefundId: (id: number | null) => void;
  setCreatedUrl: (url: string | null) => void;
  copyLink: (url: string) => void;
  checkStatus: (p: Payment) => void;
  refundMutation: UseMutationResult<unknown, Error, number>;
}

export default function PaymentTable({
  payments, total, totalPages, page, isLoading,
  detailId, refundId, createdUrl,
  setPage, setDetailId, setRefundId, setCreatedUrl,
  copyLink, checkStatus, refundMutation,
}: Props) {
  // ── Экран с созданной ссылкой ────────────────────────────────────────
  if (createdUrl) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow-lg p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Icon name="CheckCircle2" size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-display font-700">Платёжная ссылка создана</h2>
        <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm text-left break-all font-mono">
          {createdUrl}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button className="bg-brand-blue text-white" onClick={() => copyLink(createdUrl)}>
            <Icon name="Copy" size={15} className="mr-2" /> Скопировать ссылку
          </Button>
          <Button variant="outline" onClick={() => window.open(createdUrl, '_blank')}>
            <Icon name="ExternalLink" size={15} className="mr-2" /> Открыть
          </Button>
        </div>
        <Button variant="ghost" className="text-muted-foreground text-sm" onClick={() => setCreatedUrl(null)}>
          Вернуться к списку платежей
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Описание / Тип</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Покупатель</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Клиент / Сделка</th>
                <th className="text-right px-4 py-3 font-semibold">Сумма</th>
                <th className="text-center px-4 py-3 font-semibold">Статус</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Платежей пока нет</td></tr>
              ) : payments.map(p => {
                const si = STATUS_INFO[p.status] || { label: p.status, cls: 'bg-muted text-foreground', icon: 'Circle' };
                const ri = p.refund_status ? REFUND_INFO[p.refund_status] : null;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="font-medium truncate">{p.description}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {typeLabel(p.payment_type)} · {fmtDate(p.created_at)}
                      </div>
                      {ri && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold mt-1 inline-block ${ri.cls}`}>
                          {ri.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm">
                      {p.buyer_email && <div className="text-muted-foreground">{p.buyer_email}</div>}
                      {p.buyer_phone && <div className="text-muted-foreground">{p.buyer_phone}</div>}
                      {!p.buyer_email && !p.buyer_phone && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm">
                      {p.owner_name && <div>{p.owner_name}</div>}
                      {p.deal_title && <div className="text-xs text-muted-foreground truncate max-w-[140px]">{p.deal_title}</div>}
                      {!p.owner_name && !p.deal_title && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {fmtMoney(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${si.cls}`}>
                        <Icon name={si.icon} size={11} />
                        {si.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {p.yookassa_url && (
                          <button
                            title="Скопировать ссылку"
                            onClick={() => copyLink(p.yookassa_url!)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="Copy" size={14} />
                          </button>
                        )}
                        {p.yookassa_url && (
                          <button
                            title="Открыть ссылку"
                            onClick={() => setDetailId(p.id)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="ExternalLink" size={14} />
                          </button>
                        )}
                        {p.status === 'pending' && p.yookassa_payment_id && (
                          <button
                            title="Проверить статус"
                            onClick={() => checkStatus(p)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="RefreshCw" size={14} />
                          </button>
                        )}
                        {p.status === 'succeeded' && !p.refund_status && (
                          <button
                            title="Возврат"
                            onClick={() => setRefundId(p.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-700"
                          >
                            <Icon name="Undo2" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">Всего: {total}</span>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <Icon name="ChevronLeft" size={15} />
                </Button>
                <span className="text-sm px-2">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <Icon name="ChevronRight" size={15} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Детали платежа + ссылка ─────────────────────────────────────── */}
      {detailId !== null && (() => {
        const p = payments.find(x => x.id === detailId);
        if (!p) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-700 text-base">{p.description}</h3>
                <button onClick={() => setDetailId(null)} className="p-2 rounded-lg hover:bg-muted">
                  <Icon name="X" size={16} />
                </button>
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Сумма:</span> {fmtMoney(p.amount)}</div>
                <div><span className="text-muted-foreground">Тип:</span> {typeLabel(p.payment_type)}</div>
                {p.buyer_email && <div><span className="text-muted-foreground">Email:</span> {p.buyer_email}</div>}
                {p.buyer_phone && <div><span className="text-muted-foreground">Телефон:</span> {p.buyer_phone}</div>}
              </div>
              {p.yookassa_url && (
                <div className="bg-muted/50 rounded-xl px-3 py-2 text-xs font-mono break-all">
                  {p.yookassa_url}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {p.yookassa_url && (
                  <>
                    <Button className="bg-brand-blue text-white" onClick={() => { copyLink(p.yookassa_url!); setDetailId(null); }}>
                      <Icon name="Copy" size={15} className="mr-2" /> Скопировать ссылку
                    </Button>
                    <Button variant="outline" onClick={() => window.open(p.yookassa_url, '_blank')}>
                      <Icon name="ExternalLink" size={15} className="mr-2" /> Открыть страницу оплаты
                    </Button>
                  </>
                )}
                <Button variant="ghost" className="text-muted-foreground text-sm" onClick={() => setDetailId(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Подтверждение возврата ───────────────────────────────────────── */}
      {refundId !== null && (() => {
        const p = payments.find(x => x.id === refundId);
        if (!p) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Icon name="Undo2" size={18} className="text-red-600" />
                </div>
                <h3 className="font-display font-700">Возврат средств</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Вернуть <strong>{fmtMoney(p.amount)}</strong> покупателю? Это действие нельзя отменить.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => refundMutation.mutate(refundId)}
                  disabled={refundMutation.isPending}
                >
                  {refundMutation.isPending ? 'Выполняется...' : 'Подтвердить возврат'}
                </Button>
                <Button variant="outline" onClick={() => setRefundId(null)}>Отмена</Button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
