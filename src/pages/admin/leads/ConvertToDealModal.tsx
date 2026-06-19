import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { Lead } from './leadsTypes';
import { crmUrl, CRM_URL } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useListingsSearch } from '../crm/createDeal/createDealHooks';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  onSuccess: (dealId: number) => void;
}

export default function ConvertToDealModal({ open, onOpenChange, lead, onSuccess }: Props) {
  const { token } = useAuth();
  const [title, setTitle] = useState(() => {
    if (lead.company) return `${lead.company} — заявка`;
    return `${lead.name} — заявка #${lead.id}`;
  });
  const [amount, setAmount] = useState(lead.budget ? String(lead.budget) : '');
  const [source, setSource] = useState(lead.source || '');
  const [notes, setNotes] = useState(lead.message || '');
  const [listingSearch, setListingSearch] = useState('');
  const [listingId, setListingId] = useState(lead.listing_id ? String(lead.listing_id) : '');
  const [listingLabel, setListingLabel] = useState('');
  const [listingDropOpen, setListingDropOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: listingResults = [], isFetching } = useListingsSearch(listingSearch);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Введите название сделки'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        lead_id: lead.id,
        source: source || undefined,
        notes: notes || undefined,
        amount: amount ? Number(amount) : undefined,
        listing_id: listingId ? Number(listingId) : undefined,
      };
      const r = await fetch(crmUrl('deals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' },
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || `Ошибка ${r.status}`);
      toast.success('Сделка создана в воронке CRM');
      onSuccess(json.id);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать сделку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Icon name="ArrowRightLeft" size={16} className="text-emerald-600" />
            </div>
            Конвертировать в сделку
          </DialogTitle>
        </DialogHeader>

        {/* Данные из лида */}
        <div className="bg-muted/40 border border-border rounded-xl p-3 mb-1">
          <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Данные из заявки</div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
              <Icon name="User" size={16} className="text-brand-blue" />
            </div>
            <div>
              <div className="font-semibold text-sm">{lead.name}</div>
              <div className="text-xs text-muted-foreground">{lead.phone}{lead.company ? ` · ${lead.company}` : ''}</div>
            </div>
            {lead.budget && (
              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">Бюджет</div>
                <div className="font-semibold text-sm">{lead.budget.toLocaleString('ru')} ₽</div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 mt-1">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Название сделки *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Аренда офиса, Продажа склада..." />
          </div>

          {/* Поиск объекта */}
          <div className="relative">
            <label className="text-xs text-muted-foreground mb-1 block">Объект из каталога</label>
            <div className="relative">
              <Icon name="Building2" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={listingId ? listingLabel || `Объект #${listingId}` : listingSearch}
                onChange={e => {
                  if (listingId) { setListingId(''); setListingLabel(''); }
                  setListingSearch(e.target.value);
                  setListingDropOpen(true);
                }}
                onFocus={() => !listingId && setListingDropOpen(true)}
                placeholder="Поиск объекта..."
                className="w-full pl-8 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
              {listingId && (
                <button onClick={() => { setListingId(''); setListingLabel(''); setListingSearch(''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <Icon name="X" size={14} />
                </button>
              )}
              {isFetching && (
                <Icon name="Loader2" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {listingDropOpen && !listingId && listingResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {listingResults.map(l => (
                  <button key={l.id} type="button"
                    onClick={() => { setListingId(String(l.id)); setListingLabel(l.title); setListingSearch(''); setListingDropOpen(false); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 text-sm border-b border-border last:border-0">
                    <div className="font-medium truncate">{l.title}</div>
                    {l.address && <div className="text-xs text-muted-foreground truncate">{l.address}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сумма сделки</label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" type="number" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Источник</label>
              <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Сайт, звонок..." />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Заметки</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              placeholder="Детали, договорённости..."
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs text-emerald-800 flex items-start gap-2">
            <Icon name="Info" size={13} className="shrink-0 mt-0.5" />
            <span>Заявка автоматически перейдёт в статус «В работе» и появится ссылка на сделку в CRM.</span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!title.trim() || saving}
              onClick={handleSubmit}
            >
              {saving
                ? <><Icon name="Loader2" size={14} className="animate-spin mr-1.5" />Создание…</>
                : <><Icon name="ArrowRightLeft" size={14} className="mr-1.5" />Создать сделку</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
