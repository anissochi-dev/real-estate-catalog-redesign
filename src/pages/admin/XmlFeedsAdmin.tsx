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
  const [importUrl, setImportUrl] = useState('');
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

  const runImport = async (mode: 'text' | 'url') => {
    if (mode === 'text' && !importText.trim()) return;
    if (mode === 'url' && !importUrl.trim()) return;
    setImporting(true);
    setImportResult('');
    try {
      const token = localStorage.getItem('biznest_token') || '';
      const payload = mode === 'url'
        ? { url: importUrl.trim() }
        : { xml: importText };
      const res = await fetch(`${XML_URL}?action=import&platform=yandex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      const fixes = (data.autofix_applied || []) as string[];
      const fixNote = fixes.length ? ` Авто-починка: ${fixes.join(', ')}.` : '';
      setImportResult(`Импортировано: ${data.imported}. Ошибок: ${(data.errors || []).length}.${fixNote}`);
      if (mode === 'text') setImportText('');
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
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold flex flex-wrap items-center gap-2">
                    <span className="break-all">{f.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${f.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>
                      {f.is_active ? 'Активен' : 'Выкл'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Платформа: {PLATFORMS.find(p => p[0] === f.platform)?.[1] || f.platform}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input readOnly value={exportUrl(f.platform)}
                      className="w-full min-w-0 px-2 py-1 text-xs border rounded bg-white" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => copy(exportUrl(f.platform))}
                        className="text-xs px-2 py-1 rounded bg-brand-blue text-white inline-flex items-center gap-1">
                        <Icon name="Copy" size={12} /> Скопировать
                      </button>
                      <a href={exportUrl(f.platform)} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70 inline-flex items-center gap-1">
                        <Icon name="ExternalLink" size={12} /> Открыть
                      </a>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <div className="font-display font-700 text-lg">Импорт из XML (Яндекс.Недвижимость)</div>
          <div className="text-sm text-muted-foreground">Загрузите фид по ссылке или вставьте XML вручную — объекты добавятся в каталог.</div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Icon name="Link" size={14} /> Ссылка на XML-фид
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
              placeholder="https://2bishop.ru/xml/yandex/23403_28.xml"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
            />
            <button
              onClick={() => runImport('url')}
              disabled={importing || !importUrl.trim()}
              className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Icon name="Download" size={14} />
              {importing ? 'Загрузка...' : 'Загрузить по URL'}
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Платформа сама скачает файл и распарсит. Битый XML починится автоматически.
          </div>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">или вставьте XML</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <textarea className="w-full px-3 py-2 border rounded-lg font-mono text-xs" rows={6}
          placeholder="<?xml version='1.0'?>..."
          value={importText} onChange={e => setImportText(e.target.value)} />
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => runImport('text')} disabled={importing || !importText.trim()}
            className="btn-orange text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            <Icon name="Upload" size={14} />
            {importing ? 'Импорт...' : 'Импортировать текст'}
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