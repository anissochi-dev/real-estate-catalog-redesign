import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  PLATFORM_HISTORY_URL, PLATFORM_LABELS, PLATFORM_TOGGLE_URL, PlatformHistoryRow, PlatformStateRow,
  loadPlatformState,
} from './platformState';

interface Props {
  platform: string;
  onChanged?: () => void;
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ru') : '—');

export default function PlatformControlPanel({ platform, onChanged }: Props) {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'director';
  const [state, setState] = useState<PlatformStateRow | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<PlatformHistoryRow[] | null>(null);
  const label = PLATFORM_LABELS[platform] || platform;

  const load = () => loadPlatformState(true).then(s => setState(s?.[platform] || null)).catch(() => setState(null));

  useEffect(() => { load(); }, [platform]);

  const toggle = async () => {
    if (!state) return;
    setSaving(true);
    setError('');
    try {
      const r = await fetch(PLATFORM_TOGGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem('biznest_token') || '' },
        body: JSON.stringify({ platform, off: !state.off }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setError(d.error || 'Не удалось изменить состояние площадки'); return; }
      setConfirm(false);
      setHistory(null);
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    if (history) { setHistory(null); return; }
    const r = await fetch(`${PLATFORM_HISTORY_URL}&platform=${platform}`).then(x => x.json()).catch(() => ({ items: [] }));
    setHistory(r.items || []);
  };

  if (!state) return null;
  const off = state.off;
  const lc = state.last_change;

  return (
    <div className={`rounded-2xl border p-4 space-y-2 ${off ? 'bg-red-50 border-red-200' : 'bg-white border-border'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${off ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
            <Icon name={off ? 'PowerOff' : 'Power'} size={18} />
          </div>
          <div>
            <div className="font-semibold text-sm">
              {label}: {off ? 'площадка выключена' : 'площадка работает'}
            </div>
            <div className="text-xs text-muted-foreground">
              {off
                ? 'Запросов к площадке нет, объявления сняты (выгружается пустой файл)'
                : `${state.listings_count} объектов выгружается · файл обновлён ${fmt(state.feed_generated_at)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${off ? 'text-red-600' : 'text-emerald-700'}`}>{off ? 'Выкл' : 'Вкл'}</span>
          <Switch
            checked={!off}
            disabled={!canManage || saving}
            onCheckedChange={() => { setError(''); setConfirm(true); }}
          />
        </div>
      </div>

      {!canManage && (
        <div className="text-[11px] text-muted-foreground">Включать и выключать площадку могут только администратор и директор</div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span>
          {lc
            ? <>Последнее изменение: <b>{lc.turned_off ? 'выключил(а)' : 'включил(а)'}</b> {lc.user_name || '—'}, {fmt(lc.at)}</>
            : 'Изменений состояния ещё не было'}
        </span>
        <button onClick={openHistory} className="inline-flex items-center gap-1 font-semibold text-brand-blue hover:underline">
          <Icon name="History" size={12} /> {history ? 'Скрыть журнал' : 'Журнал'}
        </button>
      </div>

      {history && (
        <div className="border-t border-border pt-2 space-y-1 max-h-48 overflow-y-auto">
          {history.length === 0 && <div className="text-[11px] text-muted-foreground">Записей нет</div>}
          {history.map((h, i) => (
            <div key={i} className="text-[11px] flex items-center gap-1.5">
              <Icon name={h.turned_off ? 'PowerOff' : 'Power'} size={11} className={h.turned_off ? 'text-red-500' : 'text-emerald-600'} />
              <span className="text-muted-foreground">{fmt(h.created_at)}</span>
              <span>{h.user_name || '—'}</span>
              <span className={h.turned_off ? 'text-red-600' : 'text-emerald-700'}>{h.turned_off ? 'выключил(а)' : 'включил(а)'}</span>
              {h.listings_count !== null && <span className="text-muted-foreground">· {h.listings_count} объектов</span>}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={v => !saving && setConfirm(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{off ? `Включить ${label}?` : `Выключить ${label}?`}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {off ? (
                  <>
                    <p>Площадка снова начнёт получать объекты: в файл вернутся {state.listings_count} объектов с отметкой «{label}».</p>
                    <p>Возобновятся запросы статистики. Объявления появятся после очередной проверки файла площадкой.</p>
                  </>
                ) : (
                  <>
                    <p>Все запросы к площадке прекратятся, она перестанет обновляться.</p>
                    <p className="font-semibold text-red-600">
                      Файл станет пустым — площадка снимет все {state.listings_count} объявлений при следующей проверке.
                    </p>
                    <p>Отметки «{label}» в объектах сохранятся — при включении всё вернётся.</p>
                  </>
                )}
                {error && <p className="text-red-600">{error}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); toggle(); }}
              disabled={saving}
              className={off ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {saving ? 'Сохраняю…' : off ? 'Включить' : 'Выключить и снять объявления'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
