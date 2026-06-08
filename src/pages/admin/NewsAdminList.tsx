import { useState } from 'react';
import { NEWS_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { NewsItem, fmtDate } from './newsAdminTypes';
import { useSettings } from '@/contexts/SettingsContext';

interface Props {
  news: NewsItem[];
  loading: boolean;
  headers: Record<string, string>;
  onNewsChange: (updater: (prev: NewsItem[]) => NewsItem[]) => void;
}

export function NewsAdminList({ news, loading, headers, onNewsChange }: Props) {
  const { settings } = useSettings();
  const siteOrigin = (settings.site_url || '').replace(/\/$/, '') || window.location.origin;
  const [report, setReport] = useState<NewsItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', summary: '', content: '', source_url: '', source_name: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);

  const openReport = async (n: NewsItem) => {
    if (report?.id === n.id) { setReport(null); setEditMode(false); return; }
    setReport(n);
    setEditMode(false);
    setLoadingFull(true);
    try {
      const r = await fetch(`${NEWS_URL}?action=admin_get&id=${n.id}`, { headers });
      const d = await r.json();
      if (d.article) {
        setReport(prev => prev ? {
          ...prev,
          content_preview: d.article.content,
          content_length: d.article.content?.length,
          source_url: d.article.source_url,
          source_name: d.article.source_name,
          summary: d.article.summary,
        } : prev);
      }
    } catch { /* тихо */ } finally { setLoadingFull(false); }
  };

  const startEdit = (n: NewsItem) => {
    setEditForm({
      title: n.title || '',
      summary: n.summary || '',
      content: n.content_preview || '',
      source_url: n.source_url || '',
      source_name: n.source_name || '',
    });
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!report) return;
    if (!editForm.title.trim()) { toast.error('Заголовок обязателен'); return; }
    setEditSaving(true);
    try {
      const r = await fetch(NEWS_URL, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'update', id: report.id, ...editForm }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Сохранено');
      const updated = { ...report, ...editForm, content_preview: editForm.content, content_length: editForm.content.length };
      setReport(updated);
      onNewsChange(prev => prev.map(n => n.id === report.id ? { ...n, title: editForm.title, summary: editForm.summary, source_url: editForm.source_url, source_name: editForm.source_name } : n));
      setEditMode(false);
    } catch { toast.error('Ошибка сети'); } finally { setEditSaving(false); }
  };

  const publish = async (id: number, state: boolean) => {
    await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'publish', id, state }) });
    onNewsChange(n => n.map(a => a.id === id ? { ...a, is_published: state } : a));
    toast.success(state ? 'Опубликовано' : 'Снято с публикации');
  };

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin mr-2" />Загрузка...
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Icon name="Newspaper" size={36} className="mx-auto mb-3 opacity-30" />
          <div>Новостей нет. Создайте первую или запустите автогенерацию.</div>
        </div>
      ) : (
        <div className="flex">
          {/* Список / таблица */}
          <div className={`flex-1 min-w-0 transition-all ${report ? 'hidden lg:block' : ''}`}>

            {/* Мобильный вид — карточки */}
            <div className="sm:hidden divide-y divide-border">
              {news.map(n => (
                <div key={n.id}
                  onClick={() => openReport(n)}
                  className={`px-4 py-3 cursor-pointer hover:bg-muted/20 transition ${report?.id === n.id ? 'bg-brand-blue/5' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm line-clamp-2">{n.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.is_auto ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {n.is_auto ? 'Авто' : 'Ручная'}
                        </span>
                        <span className="text-xs text-muted-foreground">{fmtDate(n.published_at || n.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {n.is_published ? (
                        <button onClick={() => publish(n.id, false)}
                          className="text-xs px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-medium">
                          Опубл.
                        </button>
                      ) : (
                        <button onClick={() => publish(n.id, true)}
                          className="text-xs px-2 py-1 rounded-lg bg-muted font-medium">
                          Опубл.
                        </button>
                      )}
                      <a href={`${siteOrigin}/news/${n.slug}`} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                        <Icon name="ExternalLink" size={14} />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Десктопный вид — таблица */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Заголовок</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-24">Тип</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-36">Дата</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground w-36">Действия</th>
                </tr>
              </thead>
              <tbody>
                {news.map(n => (
                  <tr key={n.id} className={`border-t border-border hover:bg-muted/20 transition cursor-pointer ${report?.id === n.id ? 'bg-brand-blue/5' : ''}`}
                    onClick={() => openReport(n)}>
                    <td className="px-4 py-3">
                      <div className="font-medium line-clamp-1">{n.title}</div>
                      {n.slug && (
                        <div className="text-xs text-muted-foreground font-mono">/news/{n.slug}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.is_auto ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {n.is_auto ? 'Авто' : 'Ручная'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(n.published_at || n.created_at)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openReport(n)}
                          className={`text-xs px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${report?.id === n.id ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-brand-blue/10 hover:text-brand-blue'}`}
                        >
                          <Icon name="BarChart2" size={12} /> Отчёт
                        </button>
                        {n.is_published ? (
                          <button onClick={() => publish(n.id, false)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600 transition font-medium">
                            Опубл.
                          </button>
                        ) : (
                          <button onClick={() => publish(n.id, true)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-muted hover:bg-emerald-100 hover:text-emerald-700 transition font-medium">
                            Опубл.
                          </button>
                        )}
                        <a href={`${siteOrigin}/news/${n.slug}`} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue transition">
                          <Icon name="ExternalLink" size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Панель отчёта / редактирования */}
          {report && (
            <div className="w-full lg:w-[420px] lg:min-w-[420px] border-l border-border flex flex-col max-h-[80vh] lg:max-h-none">
              {/* Шапка с переключателем режимов */}
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between gap-2 sticky top-0 z-10">
                <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-border">
                  <button
                    onClick={() => setEditMode(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${!editMode ? 'bg-brand-blue text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon name="BarChart2" size={12} />
                    Отчёт
                  </button>
                  <button
                    onClick={() => startEdit(report)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${editMode ? 'bg-brand-blue text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon name="Pencil" size={12} />
                    Редактировать
                  </button>
                </div>
                <button onClick={() => { setReport(null); setEditMode(false); }} className="p-1 rounded hover:bg-muted text-muted-foreground">
                  <Icon name="X" size={15} />
                </button>
              </div>

              {/* ── РЕЖИМ ОТЧЁТА ── */}
              {!editMode && (
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  <div>
                    <div className="font-semibold text-sm leading-snug">{report.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-mono">/news/{report.slug}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Статус</div>
                      <div className={`text-sm font-semibold flex items-center gap-1.5 ${report.is_published ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <Icon name={report.is_published ? 'CheckCircle' : 'Clock'} size={13} />
                        {report.is_published ? 'Опубликована' : 'Черновик'}
                      </div>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Тип</div>
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <Icon name={report.is_auto ? 'Bot' : 'PenLine'} size={13} />
                        {report.is_auto ? 'Авто' : 'Ручная'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Дата</div>
                      <div className="text-xs font-medium">{fmtDate(report.published_at || report.created_at)}</div>
                    </div>
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Объём</div>
                      <div className="text-sm font-medium">
                        {report.content_length ? `${report.content_length.toLocaleString('ru')} симв.` : '—'}
                      </div>
                    </div>
                  </div>

                  {report.cb_key_rate != null && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="text-[10px] text-amber-700 uppercase tracking-wide mb-1 font-semibold">Ключевая ставка ЦБ на момент публикации</div>
                      <div className="text-xl font-bold text-amber-700">{report.cb_key_rate}%</div>
                    </div>
                  )}

                  {(report.source_url || report.source_name) ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-blue-700 uppercase tracking-wide font-semibold flex items-center gap-1">
                        <Icon name="Link" size={11} /> Источник
                      </div>
                      {report.source_name && <div className="text-sm font-medium text-blue-900">{report.source_name}</div>}
                      {report.source_url && (
                        <a href={report.source_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 underline break-all flex items-start gap-1">
                          <Icon name="ExternalLink" size={11} className="mt-0.5 shrink-0" />
                          {report.source_url}
                        </a>
                      )}
                    </div>
                  ) : report.is_auto ? (
                    <div className="bg-muted/40 rounded-xl p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 font-semibold flex items-center gap-1">
                        <Icon name="Globe" size={11} /> Источники
                      </div>
                      <div className="text-xs text-muted-foreground">На основе открытых новостей из интернета (Google News / Яндекс)</div>
                    </div>
                  ) : null}

                  {report.summary && (
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Анонс</div>
                      <div className="text-sm text-foreground/80 leading-relaxed">{report.summary}</div>
                    </div>
                  )}

                  {(report.content_preview || loadingFull) && (
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1 flex items-center gap-1.5">
                        Начало статьи
                        {loadingFull && <Icon name="Loader2" size={11} className="animate-spin" />}
                      </div>
                      <div className="text-xs text-foreground/70 leading-relaxed bg-muted/30 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-line">
                        {report.content_preview}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <a href={`${window.location.origin}/news/${report.slug}`} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-blue text-white text-sm font-medium hover:opacity-90 transition">
                      <Icon name="ExternalLink" size={14} /> Открыть
                    </a>
                    <button
                      onClick={() => { publish(report.id, !report.is_published); setReport({ ...report, is_published: !report.is_published }); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${report.is_published ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    >
                      <Icon name={report.is_published ? 'EyeOff' : 'Eye'} size={14} />
                      {report.is_published ? 'Снять' : 'Опубликовать'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── РЕЖИМ РЕДАКТИРОВАНИЯ ── */}
              {editMode && (
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide block mb-1">Заголовок *</label>
                    <input
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide block mb-1">Анонс</label>
                    <textarea
                      value={editForm.summary}
                      onChange={e => setEditForm(f => ({ ...f, summary: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide block mb-1">
                      Текст статьи
                      <span className="ml-2 text-muted-foreground/60 normal-case font-normal">
                        {editForm.content.length.toLocaleString('ru')} симв.
                      </span>
                    </label>
                    <textarea
                      value={editForm.content}
                      onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                      rows={12}
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-mono text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide block mb-1">Источник — название</label>
                      <input
                        value={editForm.source_name}
                        onChange={e => setEditForm(f => ({ ...f, source_name: e.target.value }))}
                        placeholder="Например: КубаньПресс"
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide block mb-1">Источник — ссылка</label>
                      <input
                        value={editForm.source_url}
                        onChange={e => setEditForm(f => ({ ...f, source_url: e.target.value }))}
                        placeholder="https://..."
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
                    <button
                      onClick={() => setEditMode(false)}
                      className="flex-1 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={editSaving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-blue text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
                    >
                      {editSaving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
                      {editSaving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}