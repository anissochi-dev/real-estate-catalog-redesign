import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

interface Check { name: string; ok: boolean; detail: string; }
interface HealthResult { checks: Check[]; score: number; passed: number; total: number; }

interface SecurityResult {
  threats: { type: string; where: string }[];
  warnings: string[];
  threat_count: number;
  admins: string[];
  external_links_in_listings: number;
  old_inactive_users: number;
  api_key_configured: boolean;
  safe: boolean;
}

interface PhotoResult {
  broken: { id: number; url: string; status: string | number }[];
  broken_count: number;
  ok_count: number;
  scanned: number;
  message: string;
}

interface S3Result {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  folders: Record<string, number>;
  cdn_base: string;
}

interface FeedItem { name: string; ok: boolean; status?: number; root_tag?: string; items?: number; size_kb?: number; error?: string; }
interface XmlResult { feeds: FeedItem[]; all_ok: boolean; checked: number; }

interface CleanAction {
  id: string; label: string; description: string; icon: string; danger?: boolean; confirm?: string;
}

const CLEAN_ACTIONS: CleanAction[] = [
  { id: 'clear_old_sessions', label: 'Очистить истёкшие сессии', description: 'Удаляет просроченные сессии пользователей из БД', icon: 'LogOut' },
  { id: 'clear_ai_logs', label: 'Очистить логи ИИ (>30 дней)', description: 'Удаляет старые записи из журнала запросов к ИИ-ассистенту', icon: 'Trash2' },
  { id: 'clear_orphan_leads', label: 'Удалить пустые заявки', description: 'Удаляет заявки без телефона, созданные более 7 дней назад', icon: 'UserX', danger: true, confirm: 'Удалить заявки без номера телефона старше 7 дней?' },
  { id: 'vacuum_stats', label: 'Очистить старую статистику', description: 'Удаляет записи статистики просмотров старше 90 дней', icon: 'BarChart2', danger: true, confirm: 'Удалить статистику просмотров старше 90 дней?' },
  { id: 'fix_slugs', label: 'Исправить slug новостей', description: 'Генерирует slug для новостей, у которых он пустой', icon: 'Link' },
  { id: 'fix_broken_photos', label: 'Удалить битые фото', description: 'Проверяет и удаляет недоступные внешние фото из объявлений', icon: 'ImageOff', danger: true, confirm: 'Проверить и удалить все битые фото из объявлений?' },
];

const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';

function req(resource: string, opts?: RequestInit) {
  const token = localStorage.getItem('auth_token') || '';
  return fetch(`${ADMIN_URL}?resource=${resource}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token, ...(opts?.headers || {}) },
  }).then(r => r.json());
}

type Section = 'health' | 'security' | 'photos' | 's3' | 'xml' | 'clean';

const SECTIONS: { id: Section; label: string; icon: string; desc: string }[] = [
  { id: 'health',   label: 'Диагностика',     icon: 'HeartPulse',  desc: 'Общая проверка сайта' },
  { id: 'security', label: 'Безопасность',     icon: 'ShieldAlert', desc: 'Антивирус и угрозы' },
  { id: 'photos',   label: 'Фото',             icon: 'ImageOff',    desc: 'Битые изображения' },
  { id: 's3',       label: 'Хранилище S3',     icon: 'HardDrive',   desc: 'Файлы на CDN' },
  { id: 'xml',      label: 'XML-фиды',         icon: 'Rss',         desc: 'Авито, ЦИАН и др.' },
  { id: 'clean',    label: 'Обслуживание',      icon: 'Wrench',      desc: 'Очистка и ремонт' },
];

export default function SiteHealthTab() {
  const [section, setSection] = useState<Section>('health');

  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [security, setSecurity] = useState<SecurityResult | null>(null);
  const [secLoading, setSecLoading] = useState(false);

  const [photos, setPhotos] = useState<PhotoResult | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const [s3, setS3] = useState<S3Result | null>(null);
  const [s3Loading, setS3Loading] = useState(false);

  const [xml, setXml] = useState<XmlResult | null>(null);
  const [xmlLoading, setXmlLoading] = useState(false);

  const [running, setRunning] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<{ id: string; msg: string; ok: boolean }[]>([]);

  // ── Загрузчики ────────────────────────────────────────────────────────────
  const loadHealth = async () => {
    setHealthLoading(true);
    try { const d = await req('site_health&action=check'); if (!d.error) setHealth(d); else toast.error(d.error); }
    catch { toast.error('Ошибка проверки'); }
    finally { setHealthLoading(false); }
  };

  const loadSecurity = async () => {
    setSecLoading(true);
    try { const d = await req('site_health&action=scan_security'); if (!d.error) setSecurity(d); else toast.error(d.error); }
    catch { toast.error('Ошибка сканирования'); }
    finally { setSecLoading(false); }
  };

  const loadPhotos = async () => {
    setPhotoLoading(true);
    try { const d = await req('site_health&action=scan_photos'); if (!d.error) setPhotos(d); else toast.error(d.error); }
    catch { toast.error('Ошибка проверки фото'); }
    finally { setPhotoLoading(false); }
  };

  const loadS3 = async () => {
    setS3Loading(true);
    try { const d = await req('site_health&action=s3_stats'); if (!d.error) setS3(d); else toast.error(d.error); }
    catch { toast.error('Ошибка S3'); }
    finally { setS3Loading(false); }
  };

  const loadXml = async () => {
    setXmlLoading(true);
    try { const d = await req('site_health&action=xml_check'); if (!d.error) setXml(d); else toast.error(d.error); }
    catch { toast.error('Ошибка проверки фидов'); }
    finally { setXmlLoading(false); }
  };

  const runAction = async (action: CleanAction) => {
    if (action.confirm && !confirm(action.confirm)) return;
    setRunning(action.id);
    try {
      const d = await req(`site_health&action=${action.id}`, { method: 'POST', body: '{}' });
      if (d.error) { setActionLog(l => [...l, { id: action.id, msg: d.error, ok: false }]); toast.error(d.error); }
      else { const msg = d.message || 'Выполнено'; setActionLog(l => [...l, { id: action.id, msg, ok: true }]); toast.success(msg); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      setActionLog(l => [...l, { id: action.id, msg, ok: false }]); toast.error(msg);
    } finally { setRunning(null); }
  };

  // ── Цвета скора ───────────────────────────────────────────────────────────
  const scoreColor = !health ? '' : health.score >= 90 ? 'text-emerald-600' : health.score >= 70 ? 'text-amber-600' : 'text-red-600';
  const barColor   = !health ? 'bg-muted' : health.score >= 90 ? 'bg-emerald-500' : health.score >= 70 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-4">

      {/* Навигация по секциям */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition ${
              section === s.id ? 'bg-brand-blue text-white border-brand-blue shadow-sm' : 'bg-white border-border hover:bg-muted/50 text-foreground/70'
            }`}>
            <Icon name={s.icon} size={18} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── ДИАГНОСТИКА ─────────────────────────────────────────────────── */}
      {section === 'health' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Icon name="HeartPulse" size={18} className="text-brand-blue" /> Диагностика сайта
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">База данных, контент, SEO и безопасность — 12 проверок</p>
            </div>
            <button onClick={loadHealth} disabled={healthLoading}
              className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={healthLoading ? 'Loader2' : 'ScanSearch'} size={16} className={healthLoading ? 'animate-spin' : ''} />
              {healthLoading ? 'Проверка…' : 'Запустить'}
            </button>
          </div>
          {health && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`text-4xl font-bold ${scoreColor}`}>{health.score}%</div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Здоровье сайта</span><span>{health.passed}/{health.total} пройдено</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-700 rounded-full`} style={{ width: `${health.score}%` }} />
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                {health.checks.map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${c.ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'}`}>
                    <Icon name={c.ok ? 'CheckCircle2' : 'AlertCircle'} size={16} className={`flex-shrink-0 mt-0.5 ${c.ok ? 'text-emerald-500' : 'text-red-500'}`} />
                    <div>
                      <span className={`font-semibold ${c.ok ? 'text-emerald-800' : 'text-red-800'}`}>{c.name}</span>
                      {c.detail && <span className="text-muted-foreground ml-2 text-xs">{c.detail}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── БЕЗОПАСНОСТЬ ────────────────────────────────────────────────── */}
      {section === 'security' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Icon name="ShieldAlert" size={18} className="text-brand-blue" /> Антивирус и безопасность
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">XSS, SQL-инъекции, brute force, подозрительные аккаунты</p>
            </div>
            <button onClick={loadSecurity} disabled={secLoading}
              className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={secLoading ? 'Loader2' : 'ShieldCheck'} size={16} className={secLoading ? 'animate-spin' : ''} />
              {secLoading ? 'Сканирование…' : 'Сканировать'}
            </button>
          </div>
          {security && (
            <div className="space-y-4">
              {/* Статус */}
              <div className={`flex items-center gap-3 px-4 py-4 rounded-xl border ${security.safe ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <Icon name={security.safe ? 'ShieldCheck' : 'ShieldX'} size={28} className={security.safe ? 'text-emerald-500' : 'text-red-500'} />
                <div>
                  <div className={`font-bold text-base ${security.safe ? 'text-emerald-700' : 'text-red-700'}`}>
                    {security.safe ? 'Угроз не обнаружено' : `Найдено угроз: ${security.threat_count}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {security.warnings.length > 0 ? `${security.warnings.length} предупреждений` : 'Предупреждений нет'}
                  </div>
                </div>
              </div>

              {/* Угрозы */}
              {security.threats.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Угрозы</div>
                  <div className="grid gap-2">
                    {security.threats.map((t, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm">
                        <Icon name="Bug" size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <div><span className="font-semibold text-red-800">{t.type}</span><span className="text-red-600 ml-2">{t.where}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Предупреждения */}
              {security.warnings.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Предупреждения</div>
                  <div className="grid gap-2">
                    {security.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                        <Icon name="AlertTriangle" size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-amber-800">{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Информация */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Администраторы', value: security.admins.join(', ') || 'нет', icon: 'ShieldHalf', warn: false },
                  { label: 'Неактивные аккаунты', value: `${security.old_inactive_users} (>180 дней)`, icon: 'UserX', warn: security.old_inactive_users > 0 },
                  { label: 'Внешние ссылки в объявлениях', value: `${security.external_links_in_listings} шт`, icon: 'ExternalLink', warn: security.external_links_in_listings > 50 },
                  { label: 'API-ключ ИИ', value: security.api_key_configured ? 'Настроен' : 'Не настроен', icon: 'Key', warn: !security.api_key_configured },
                ].map((item, i) => (
                  <div key={i} className={`p-3 rounded-xl border text-sm ${item.warn ? 'bg-amber-50 border-amber-200' : 'bg-muted/30 border-border'}`}>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Icon name={item.icon} size={12} />{item.label}
                    </div>
                    <div className={`font-semibold text-xs ${item.warn ? 'text-amber-700' : ''}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── БИТЫЕ ФОТО ──────────────────────────────────────────────────── */}
      {section === 'photos' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Icon name="ImageOff" size={18} className="text-brand-blue" /> Проверка фотографий
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">Проверяет внешние фото объявлений на доступность (выборка 30 шт)</p>
            </div>
            <button onClick={loadPhotos} disabled={photoLoading}
              className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={photoLoading ? 'Loader2' : 'ScanSearch'} size={16} className={photoLoading ? 'animate-spin' : ''} />
              {photoLoading ? 'Проверка…' : 'Проверить'}
            </button>
          </div>
          {photos && (
            <div className="space-y-3">
              {/* Итог */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${photos.broken_count === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <Icon name={photos.broken_count === 0 ? 'CheckCircle2' : 'AlertCircle'} size={22}
                  className={photos.broken_count === 0 ? 'text-emerald-500' : 'text-amber-500'} />
                <div>
                  <div className="font-semibold text-sm">{photos.message}</div>
                  <div className="text-xs text-muted-foreground">Доступных: {photos.ok_count} · Битых: {photos.broken_count}</div>
                </div>
              </div>
              {/* Список битых */}
              {photos.broken.length > 0 && (
                <div className="grid gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Битые фото</div>
                  {photos.broken.map((b, i) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs">
                      <Icon name="ImageOff" size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-semibold text-red-700">Объявление #{b.id}</span>
                        <div className="text-muted-foreground truncate">{b.url}</div>
                        <div className="text-red-500">{b.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {photos.broken_count > 0 && (
                <button onClick={() => runAction(CLEAN_ACTIONS.find(a => a.id === 'fix_broken_photos')!)}
                  disabled={!!running}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  <Icon name={running === 'fix_broken_photos' ? 'Loader2' : 'Trash2'} size={15} className={running === 'fix_broken_photos' ? 'animate-spin' : ''} />
                  Удалить все битые фото из объявлений
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── S3 ХРАНИЛИЩЕ ────────────────────────────────────────────────── */}
      {section === 's3' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Icon name="HardDrive" size={18} className="text-brand-blue" /> Хранилище S3 / CDN
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">Количество файлов и занятое место по папкам</p>
            </div>
            <button onClick={loadS3} disabled={s3Loading}
              className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={s3Loading ? 'Loader2' : 'RefreshCw'} size={16} className={s3Loading ? 'animate-spin' : ''} />
              {s3Loading ? 'Загрузка…' : 'Обновить'}
            </button>
          </div>
          {s3 && (
            <div className="space-y-3">
              {/* Общий итог */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-brand-blue/5 border border-brand-blue/20 rounded-xl text-center">
                  <div className="text-2xl font-bold text-brand-blue">{s3.total_size_human}</div>
                  <div className="text-xs text-muted-foreground mt-1">Занято места</div>
                </div>
                <div className="p-4 bg-brand-blue/5 border border-brand-blue/20 rounded-xl text-center">
                  <div className="text-2xl font-bold text-brand-blue">{s3.total_files.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">Файлов всего</div>
                </div>
              </div>
              {/* По папкам */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">По папкам</div>
                <div className="grid gap-2">
                  {Object.entries(s3.folders).map(([folder, count]) => (
                    <div key={folder} className="flex items-center justify-between px-4 py-2.5 bg-muted/30 rounded-xl border border-border text-sm">
                      <div className="flex items-center gap-2">
                        <Icon name="Folder" size={14} className="text-muted-foreground" />
                        <span className="font-mono text-xs">{folder}/</span>
                      </div>
                      <span className="font-semibold">{count} файлов</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* CDN URL */}
              <div className="px-3 py-2.5 bg-muted/30 rounded-xl border border-border">
                <div className="text-xs text-muted-foreground mb-1">CDN адрес</div>
                <div className="text-xs font-mono text-foreground/70 break-all">{s3.cdn_base}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── XML-ФИДЫ ────────────────────────────────────────────────────── */}
      {section === 'xml' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Icon name="Rss" size={18} className="text-brand-blue" /> Проверка XML-фидов
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">Авито, ЦИАН и другие — доступность и валидность</p>
            </div>
            <button onClick={loadXml} disabled={xmlLoading}
              className="bg-brand-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name={xmlLoading ? 'Loader2' : 'Rss'} size={16} className={xmlLoading ? 'animate-spin' : ''} />
              {xmlLoading ? 'Проверка…' : 'Проверить'}
            </button>
          </div>
          {xml && (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${xml.all_ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <Icon name={xml.all_ok ? 'CheckCircle2' : 'AlertCircle'} size={20} className={xml.all_ok ? 'text-emerald-500' : 'text-amber-500'} />
                <div className="font-semibold text-sm">
                  {xml.all_ok ? `Все ${xml.checked} фидов работают` : `Есть проблемы в фидах`}
                </div>
              </div>
              <div className="grid gap-2">
                {xml.feeds.map((f, i) => (
                  <div key={i} className={`px-4 py-3 rounded-xl border text-sm ${f.ok ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Icon name={f.ok ? 'CheckCircle2' : 'XCircle'} size={15} className={f.ok ? 'text-emerald-500' : 'text-red-500'} />
                        <span className="font-semibold">{f.name}</span>
                      </div>
                      {f.ok && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {f.items !== undefined && <span>{f.items} элементов</span>}
                          {f.size_kb !== undefined && <span>{f.size_kb} КБ</span>}
                          {f.root_tag && <span className="font-mono">&lt;{f.root_tag}&gt;</span>}
                        </div>
                      )}
                    </div>
                    {f.error && <div className="text-xs text-red-600 mt-1.5 ml-5">{f.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ОБСЛУЖИВАНИЕ ────────────────────────────────────────────────── */}
      {section === 'clean' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border space-y-4">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Icon name="Wrench" size={18} className="text-brand-blue" /> Инструменты обслуживания
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">Очистка, ремонт и оптимизация данных</p>
          </div>
          <div className="grid gap-3">
            {CLEAN_ACTIONS.map(action => {
              const isRunning = running === action.id;
              const log = actionLog.filter(l => l.id === action.id).slice(-1)[0];
              return (
                <div key={action.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${action.danger ? 'bg-red-100 text-red-600' : 'bg-brand-blue/10 text-brand-blue'}`}>
                    <Icon name={action.icon} size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{action.label}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                    {log && (
                      <div className={`text-xs mt-1 font-medium ${log.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                        {log.ok ? '✓' : '✗'} {log.msg}
                      </div>
                    )}
                  </div>
                  <button onClick={() => runAction(action)} disabled={!!running}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                      action.danger ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                    }`}>
                    <Icon name={isRunning ? 'Loader2' : 'Play'} size={14} className={isRunning ? 'animate-spin' : ''} />
                    {isRunning ? 'Выполняется…' : 'Запустить'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Рекомендации */}
          <div className="pt-2 border-t border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Рекомендации</div>
            <div className="grid gap-2.5 text-sm text-muted-foreground">
              {[
                { icon: 'Lock', text: 'Используйте сложные пароли для учётных записей сотрудников' },
                { icon: 'Eye', text: 'Регулярно проверяйте список активных пользователей во вкладке «Роли»' },
                { icon: 'RefreshCw', text: 'Запускайте диагностику раз в неделю — это помогает выявить проблемы заранее' },
                { icon: 'Image', text: 'Периодически запускайте сжатие фото — уменьшает нагрузку на CDN' },
                { icon: 'Database', text: 'Делайте экспорт данных через «Экспорт/импорт» как резервную копию' },
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Icon name={tip.icon} size={14} className="flex-shrink-0 mt-0.5 text-brand-blue/60" />
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
