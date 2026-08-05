import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { XML_URL } from './shared';

export default function XmlImportCard() {
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importResult, setImportResult] = useState<string>('');

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
  );
}
