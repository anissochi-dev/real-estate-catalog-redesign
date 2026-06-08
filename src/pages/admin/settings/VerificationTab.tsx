import { useState } from 'react';
import Icon from '@/components/ui/icon';

const VERIFY_URL = 'https://functions.poehali.dev/f18a8295-a9d1-474d-9c3a-211d8092ef47';

const SERVICE_PRESETS = [
  { label: 'Яндекс.Вебмастер', fileHint: 'yandex_xxxxxxxx.html', contentHint: 'yandex-verification: xxxxxxxx', comment: 'Яндекс.Вебмастер' },
  { label: 'Google Search Console', fileHint: 'googlexxxxxxxx.html', contentHint: 'google-site-verification: xxxxxxxx', comment: 'Google Search Console' },
  { label: 'Mail.ru / VK Вебмастер', fileHint: 'mailru-domainXXXXXXXX', contentHint: 'mailru-домен: XXXXXXXX', comment: 'Mail.ru Вебмастер' },
  { label: 'Bing Webmaster', fileHint: 'BingSiteAuth.xml', contentHint: '<?xml version="1.0"?>\n<users>\n  <user>XXXXXXXX</user>\n</users>', comment: 'Bing Webmaster' },
  { label: 'Rambler', fileHint: 'rambler-xxxxxxxxxx.html', contentHint: 'rambler-site-verification: xxxxxxxxxx', comment: 'Rambler' },
];

interface VerifFile {
  filename: string;
  content: string;
  comment?: string;
  cdn_url?: string;
}

interface Props {
  siteUrl?: string;
}

export default function VerificationTab({ siteUrl }: Props) {
  const [files, setFiles] = useState<VerifFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newFile, setNewFile] = useState<VerifFile>({ filename: '', content: '', comment: '' });
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Загружаем список при открытии вкладки
  const loadFiles = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${VERIFY_URL}?action=list`);
      const d = await r.json();
      setFiles(d.files || []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  if (!loaded && !loading) {
    loadFiles();
  }

  const getSiteFileUrl = (filename: string) => {
    const base = (siteUrl || '').replace(/\/$/, '');
    return base ? `${base}/${filename}` : `/${filename}`;
  };

  // Загружаем файл в S3 через verify-file?action=upload
  const handleUpload = async () => {
    const filename = newFile.filename.trim().replace(/^\/+/, '');
    const content = newFile.content.trim();
    if (!filename || !content) return;

    setUploading(true);
    setUploadError('');
    try {
      const r = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', filename, content, comment: newFile.comment }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Ошибка загрузки');
      // Обновляем список
      await loadFiles();
      setNewFile({ filename: '', content: '', comment: '' });
      setAdding(false);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    setDeleting(filename);
    try {
      await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', filename }),
      });
      setFiles(prev => prev.filter(f => f.filename !== filename));
    } finally {
      setDeleting(null);
    }
  };

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Файлы верификации</h2>
        <p className="text-sm text-foreground/50 mt-1">
          Подтверждение домена в Яндекс.Вебмастере, Google Search Console, Mail.ru и других сервисах.
          Файл публикуется мгновенно и сразу доступен по URL сайта.
        </p>
      </div>

      {/* Список файлов */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Icon name="Loader2" size={16} className="animate-spin" />
          Загрузка…
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="space-y-3">
          {files.map((f) => {
            const siteUrl_ = getSiteFileUrl(f.filename);
            const urlToCopy = f.cdn_url ? siteUrl_ : siteUrl_;
            return (
              <div key={f.filename} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-foreground">{f.filename}</span>
                      {f.comment && (
                        <span className="text-xs text-foreground/40 bg-muted px-2 py-0.5 rounded-full">{f.comment}</span>
                      )}
                      {f.cdn_url && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Icon name="CheckCircle" size={11} /> Опубликован
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground/40 mt-0.5 font-mono truncate">
                      {f.content.slice(0, 80)}{f.content.length > 80 ? '…' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(f.filename)}
                    disabled={deleting === f.filename}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-foreground/30 hover:text-red-500 shrink-0 transition"
                  >
                    <Icon name={deleting === f.filename ? 'Loader2' : 'Trash2'} size={15} className={deleting === f.filename ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* URL для вставки в сервис */}
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <p className="text-xs font-medium text-foreground/60">URL для вставки в сервис верификации:</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 font-mono text-xs text-emerald-800 truncate">
                      {siteUrl_}
                    </div>
                    <button
                      onClick={() => copyUrl(siteUrl_, f.filename)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition shrink-0"
                    >
                      <Icon name={copied === f.filename ? 'Check' : 'Copy'} size={13} />
                      {copied === f.filename ? 'Скопировано' : 'Скопировать'}
                    </button>
                    <a
                      href={f.cdn_url || siteUrl_}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground transition"
                      title="Проверить файл"
                    >
                      <Icon name="ExternalLink" size={14} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && files.length === 0 && !adding && (
        <div className="text-center py-10 text-foreground/30 text-sm border-2 border-dashed border-border rounded-xl">
          <Icon name="FileCheck" size={32} className="mx-auto mb-2 opacity-30" />
          Файлы верификации не добавлены
        </div>
      )}

      {/* Форма добавления */}
      {adding && (
        <div className="border border-brand-blue/30 rounded-xl p-4 bg-brand-blue/5 space-y-4">
          <p className="text-sm font-semibold text-foreground/70">Новый файл верификации</p>

          <div>
            <p className="text-xs text-foreground/50 mb-2">Выберите сервис для автозаполнения:</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setNewFile({ filename: p.fileHint, content: p.contentHint, comment: p.comment })}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/10 transition font-medium"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-foreground/50 mb-1 block">Имя файла (точно как указано в сервисе)</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                placeholder="yandex_1234abcd.html"
                value={newFile.filename}
                onChange={e => setNewFile(p => ({ ...p, filename: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-foreground/50 mb-1 block">Содержимое файла</label>
              <textarea
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
                rows={4}
                placeholder="yandex-verification: 7099028f3e2220eb"
                value={newFile.content}
                onChange={e => setNewFile(p => ({ ...p, content: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-foreground/50 mb-1 block">Комментарий (необязательно)</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                placeholder="Яндекс.Вебмастер"
                value={newFile.comment}
                onChange={e => setNewFile(p => ({ ...p, comment: e.target.value }))}
              />
            </div>
          </div>

          {uploadError && (
            <div className="text-sm text-red-600 flex items-center gap-2">
              <Icon name="AlertCircle" size={14} />
              {uploadError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleUpload}
              disabled={uploading || !newFile.filename.trim() || !newFile.content.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-40 transition"
            >
              <Icon name={uploading ? 'Loader2' : 'Upload'} size={15} className={uploading ? 'animate-spin' : ''} />
              {uploading ? 'Публикуем…' : 'Опубликовать файл'}
            </button>
            <button
              onClick={() => { setAdding(false); setNewFile({ filename: '', content: '', comment: '' }); setUploadError(''); }}
              className="px-4 py-2 rounded-lg text-sm text-foreground/60 hover:bg-muted transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Кнопка добавить */}
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-blue/30 text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 transition"
        >
          <Icon name="Plus" size={15} />
          Добавить файл
        </button>
      )}

      <div className="bg-muted/60 rounded-xl p-4 text-sm space-y-2 text-foreground/60">
        <p className="font-semibold text-foreground/80">Как использовать:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Нажмите «Добавить файл», выберите сервис или введите данные вручную</li>
          <li>Нажмите «Опубликовать файл» — файл сразу становится доступен</li>
          <li>Скопируйте URL и вставьте в поле верификации сервиса</li>
        </ol>
        <p className="text-xs text-foreground/40 pt-1">
          Файл публикуется мгновенно — без ожидания билда. Поддерживаются: Яндекс, Google, Mail.ru / VK, Bing, Rambler и любые другие.
        </p>
      </div>
    </div>
  );
}
