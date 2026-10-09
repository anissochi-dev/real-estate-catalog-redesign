import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { getToken } from '@/lib/adminApi';
import type { FailingPlatform, StalePlatform } from './ad-cabinet/types';

const YOULA_CLAIM_RESET_URL = 'https://functions.poehali.dev/7c55dfb4-7ede-46fb-be64-dea578da5eb7?action=youla_claim_reset';

interface Props {
  stale: StalePlatform[];
  failing: FailingPlatform[];
  onOpenAdCabinet: () => void;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtHours(h: number | null) {
  if (h === null) return 'ни разу не синхронизировалась';
  if (h < 48) return `${Math.round(h)} ч. без обновления`;
  return `${Math.round(h / 24)} дн. без обновления`;
}

export default function PlatformAlertsPanel({ stale, failing, onOpenAdCabinet }: Props) {
  const [resetDone, setResetDone] = useState<Set<number>>(new Set());
  const [resetting, setResetting] = useState<number | null>(null);
  const visibleFailing = failing.filter(f => !(f.listing_id && resetDone.has(f.listing_id)));
  const failingKeys = new Set(visibleFailing.map(f => f.key));
  const staleOnly = stale.filter(s => !failingKeys.has(s.key));

  const resendYoula = async (listingId: number) => {
    if (!confirm(`Подтвердите: на Юле НЕТ объявления с «Код объекта: ${listingId}». Объект будет отправлен заново при следующей синхронизации.`)) return;
    setResetting(listingId);
    try {
      const token = getToken();
      const r = await fetch(`${YOULA_CLAIM_RESET_URL}&token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ listing_id: listingId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      setResetDone(prev => new Set(prev).add(listingId));
      toast.success('Объект будет отправлен на Юлу при следующей синхронизации');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось');
    } finally {
      setResetting(null);
    }
  };

  if (visibleFailing.length === 0 && staleOnly.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Icon name="CheckCircle2" size={28} className="mx-auto mb-2 text-emerald-500 opacity-60" />
        Все площадки синхронизируются в штатном режиме
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleFailing.map(f => (
        <div key={`f-${f.key}`} className="border border-red-200 bg-red-50 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm text-red-800">
              <Icon name="AlertTriangle" size={16} />
              {f.listing_id ? f.label : `${f.label}: ошибка синхронизации`}
            </div>
            {!f.listing_id && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">
                {f.errors} подряд
              </span>
            )}
          </div>
          {f.last_error && (
            <div className="text-xs text-red-700 break-words">{f.last_error}</div>
          )}
          <div className="text-xs text-red-600/80">
            {f.listing_id ? 'Отправка начата' : 'Последняя попытка'}: {fmtDate(f.last_attempt)}
            {f.paused_until && <> · пауза до {fmtDate(f.paused_until)}</>}
          </div>
          {f.listing_id && (
            <button
              onClick={() => resendYoula(f.listing_id!)}
              disabled={resetting === f.listing_id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
            >
              <Icon name="RefreshCw" size={12} /> Отправить снова
            </button>
          )}
        </div>
      ))}

      {staleOnly.map(s => (
        <div key={`s-${s.key}`} className="border border-amber-200 bg-amber-50 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-sm text-amber-800">
            <Icon name="Clock" size={16} />
            {s.label}: данные устарели
          </div>
          <div className="text-xs text-amber-700">
            {fmtHours(s.hours_ago)}{s.last_sync && <> · последняя: {fmtDate(s.last_sync)}</>}
          </div>
        </div>
      ))}

      <button
        onClick={onOpenAdCabinet}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
      >
        <Icon name="Megaphone" size={14} /> Открыть рекламный кабинет
      </button>
    </div>
  );
}
