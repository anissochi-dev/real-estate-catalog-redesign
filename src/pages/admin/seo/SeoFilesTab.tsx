import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { seoUrl } from './seoTypes';

interface FileStatus {
  robots_url?: string;
  sitemap_url?: string;
  sitemap_urls_count?: number;
  sitemap_updated_at?: string | null;
  robots_disallow?: string[];
}

interface Props {
  token: string;
}

export default function SeoFilesTab({ token }: Props) {
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' };
  const [status, setStatus] = useState<FileStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(seoUrl(token), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'files_status' }),
      });
      if (!r.ok) {
        setError(`Не удалось загрузить статус (HTTP ${r.status})`);
        return;
      }
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setStatus(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const regenerate = async () => {
    setRegenerating(true);
    setError('');
    setMsg('');
    try {
      const r = await fetch(seoUrl(token), {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'sitemap_rebuild' }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setMsg(`Sitemap обновлён: ${d.urls_count || 0} URL`);
      await load();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Icon name="FileCode2" size={16} className="text-brand-blue" />
          robots.txt и sitemap.xml
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Файлы для поисковых роботов. Sitemap собирается автоматически из активных объектов и публичных страниц.
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Icon name="AlertCircle" size={14} /> {error}
        </div>
      )}

      {msg && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Icon name="CheckCircle2" size={14} /> {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* robots.txt */}
        <div className="bg-white border rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Icon name="Shield" size={14} className="text-emerald-600" />
              robots.txt
            </div>
            {status?.robots_url && (
              <a
                href={status.robots_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
              >
                <Icon name="ExternalLink" size={11} /> Открыть
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Запрещает индексацию админки и страниц входа сотрудников.
          </p>
          {status?.robots_disallow && status.robots_disallow.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-2 space-y-0.5">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase">Закрыто от индексации:</div>
              {status.robots_disallow.map(d => (
                <div key={d} className="text-xs font-mono text-foreground">Disallow: {d}</div>
              ))}
            </div>
          )}
        </div>

        {/* sitemap.xml */}
        <div className="bg-white border rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Icon name="Map" size={14} className="text-blue-600" />
              sitemap.xml
            </div>
            {status?.sitemap_url && (
              <a
                href={status.sitemap_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
              >
                <Icon name="ExternalLink" size={11} /> Открыть
              </a>
            )}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">URL в карте:</span>
              <span className="font-semibold">{status?.sitemap_urls_count ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Обновлён:</span>
              <span className="font-semibold">
                {status?.sitemap_updated_at
                  ? new Date(status.sitemap_updated_at).toLocaleString('ru', {
                      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </span>
            </div>
          </div>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="w-full mt-2 px-3 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-brand-blue/90"
          >
            <Icon name={regenerating ? 'Loader2' : 'RefreshCw'} size={13} className={regenerating ? 'animate-spin' : ''} />
            Пересобрать sitemap
          </button>
        </div>
      </div>

      <div className="bg-muted/30 rounded-2xl p-4 space-y-1">
        <div className="font-semibold text-sm flex items-center gap-2">
          <Icon name="Info" size={14} /> Что важно знать
        </div>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Sitemap обновляется автоматически при добавлении и снятии объектов</li>
          <li>Кнопка «Пересобрать» полезна, если что-то пошло не так или нужно ускорить обновление</li>
          <li>После публикации сайта добавьте sitemap в Яндекс.Вебмастер и Google Search Console</li>
          <li>Админка и страницы входа закрыты от индексации через robots.txt и meta-тег noindex</li>
        </ul>
      </div>
    </div>
  );
}
