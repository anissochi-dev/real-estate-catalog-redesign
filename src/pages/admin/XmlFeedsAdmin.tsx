import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const XML_URL = 'https://functions.poehali.dev/7c55dfb4-7ede-46fb-be64-dea578da5eb7';

interface F {
  id: number;
  name: string;
  platform: string;
  feed_type: string;
  url: string | null;
  is_active: boolean;
}

const PLATFORMS = [
  ['yandex', 'Яндекс.Недвижимость'],
  ['avito', 'Авито'],
  ['cian', 'ЦИАН'],
  ['custom', 'Другое'],
];

export default function XmlFeedsAdmin() {
  const [items, setItems] = useState<F[]>([]);
  const [editing, setEditing] = useState<Partial<F> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<string>('');

  const load = () => adminApi.listFeeds().then(d => setItems(d.feeds));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await adminApi.updateFeed(editing.id, editing as Record<string, unknown>);
      else await adminApi.createFeed(editing as Record<string, unknown>);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить фид?')) return;
    await adminApi.deleteFeed(id);
    load();
  };

  const exportUrl = (platform: string) => `${XML_URL}?platform=${platform}`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Скопировано');
  };

  const runImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult('');
    try {
      const token = localStorage.getItem('biznest_token') || '';
      const res = await fetch(`${XML_URL}?action=import&platform=yandex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ xml: importText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setImportResult(`Импортировано: ${data.imported}. Ошибок: ${(data.errors || []).length}`);
      setImportText('');
    } catch (e: unknown) {
      setImportResult('Ошибка: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div className="font-display font-700 text-lg">XML фиды (экспорт)</div>
          <button onClick={() => setEditing({ name: '', platform: 'yandex', feed_type: 'export', is_active: true })}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Icon name="Plus" size={14} /> Добавить фид
          </button>
        </div>

        <div className="space-y-2">
          {items.map(f => (
            <div key={f.id} className="p-3 bg-muted/30 rounded-lg">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    {f.name}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>
                      {f.is_active ? 'Активен' : 'Выкл'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Платформа: {PLATFORMS.find(p => p[0] === f.platform)?.[1] || f.platform}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <input readOnly value={exportUrl(f.platform)}
                      className="flex-1 px-2 py-1 text-xs border rounded bg-white" />
                    <button onClick={() => copy(exportUrl(f.platform))}
                      className="text-xs px-2 py-1 rounded bg-brand-blue text-white">
                      <Icon name="Copy" size={12} />
                    </button>
                    <a href={exportUrl(f.platform)} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70">
                      <Icon name="ExternalLink" size={12} />
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditing(f)} className="text-brand-blue p-1">
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button onClick={() => del(f.id)} className="text-red-600 p-1">
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          В карточке объекта поставьте галочки «Яндекс / Авито / ЦИАН» — объект попадёт в соответствующий фид.
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <div className="font-display font-700 text-lg">Импорт из XML (Яндекс.Недвижимость)</div>
        <div className="text-sm text-muted-foreground">Вставьте XML фид от Яндекс.Недвижимости — объекты загрузятся в каталог.</div>
        <textarea className="w-full px-3 py-2 border rounded-lg font-mono text-xs" rows={6}
          placeholder="<?xml version='1.0'?>..."
          value={importText} onChange={e => setImportText(e.target.value)} />
        <div className="flex items-center gap-3">
          <button onClick={runImport} disabled={importing || !importText.trim()}
            className="btn-orange text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            <Icon name="Upload" size={14} />
            {importing ? 'Импорт...' : 'Импортировать'}
          </button>
          {importResult && <div className="text-sm">{importResult}</div>}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div className="font-display font-700 text-lg">
                {editing.id ? 'Редактировать' : 'Новый XML фид'}
              </div>
              <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Название</label>
                <input className="w-full px-3 py-2 border rounded-lg"
                  value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Платформа</label>
                <select className="w-full px-3 py-2 border rounded-lg" value={editing.platform || 'yandex'}
                  onChange={e => setEditing({ ...editing, platform: e.target.value })}>
                  {PLATFORMS.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active !== false}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                Активен
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
              <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}