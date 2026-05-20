import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const MIGRATION_URL = 'https://functions.poehali.dev/35b499c9-243a-43e1-ac7b-2d6e84453233';

async function migrationReq(path: string, init?: RequestInit) {
  const res = await fetch(`${MIGRATION_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': getToken(),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

interface Stats {
  listings_total: number;
  listings_active: number;
  contacts_total: number;
  generated_at: string;
}

export default function MigrationTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImportType, setPendingImportType] = useState<'listings' | 'contacts' | null>(null);

  useEffect(() => {
    migrationReq('/?action=stats')
      .then(d => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const doExport = async (type: 'listings' | 'contacts' | 'settings' | 'all') => {
    setExporting(type);
    try {
      const data = await migrationReq(`/?action=export&type=${type}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date().toISOString().slice(0, 10);
      a.download = `biznest-${type}-${now}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExporting(null);
    }
  };

  const openImport = (type: 'listings' | 'contacts') => {
    setPendingImportType(type);
    fileRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingImportType) return;
    e.target.value = '';
    setImporting(pendingImportType);
    setImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let data: unknown[] = [];
      if (Array.isArray(parsed)) {
        data = parsed;
      } else if (parsed[pendingImportType] && Array.isArray(parsed[pendingImportType])) {
        data = parsed[pendingImportType];
      } else {
        throw new Error('Неверный формат файла. Ожидается массив или экспортированный JSON.');
      }
      const result = await migrationReq('/', {
        method: 'POST',
        body: JSON.stringify({ action: 'import', type: pendingImportType, data }),
      });
      const count = result.created || 0;
      const errs = (result.errors || []).length;
      setImportResult({
        ok: true,
        message: `Импортировано: ${count} записей${errs > 0 ? `. Ошибок: ${errs}` : '.'}`,
      });
    } catch (e: unknown) {
      setImportResult({ ok: false, message: e instanceof Error ? e.message : 'Ошибка импорта' });
    } finally {
      setImporting(null);
      setPendingImportType(null);
    }
  };

  const EXPORTS = [
    { id: 'all', label: 'Полный бэкап', desc: 'Объекты + контакты + настройки', icon: 'DatabaseBackup', color: 'bg-brand-blue text-white' },
    { id: 'listings', label: 'Объекты', desc: `${stats?.listings_total ?? '—'} записей`, icon: 'Building2', color: 'bg-emerald-600 text-white' },
    { id: 'contacts', label: 'Контакты (лиды)', desc: `${stats?.contacts_total ?? '—'} записей`, icon: 'Users', color: 'bg-violet-600 text-white' },
    { id: 'settings', label: 'Настройки сайта', desc: 'Конфигурация и реквизиты', icon: 'Settings', color: 'bg-amber-500 text-white' },
  ] as const;

  const IMPORTS = [
    { id: 'listings' as const, label: 'Импорт объектов', desc: 'Загрузить объекты из JSON-файла', icon: 'Building2' },
    { id: 'contacts' as const, label: 'Импорт контактов', desc: 'Загрузить лиды/контакты из JSON-файла', icon: 'Users' },
  ];

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={onFileChange} />

      {/* Статистика */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="font-semibold text-base mb-4 flex items-center gap-2">
          <Icon name="BarChart3" size={18} className="text-brand-blue" />
          Состояние базы данных
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Icon name="Loader2" size={16} className="animate-spin" /> Загрузка...
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-brand-blue">{stats.listings_active}</div>
              <div className="text-xs text-muted-foreground">Активных объектов</div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold">{stats.listings_total}</div>
              <div className="text-xs text-muted-foreground">Объектов всего</div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-violet-600">{stats.contacts_total}</div>
              <div className="text-xs text-muted-foreground">Контактов/лидов</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Не удалось загрузить статистику</div>
        )}
      </div>

      {/* Экспорт */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="font-semibold text-base mb-1 flex items-center gap-2">
          <Icon name="Download" size={18} className="text-emerald-600" />
          Экспорт данных
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Скачайте данные в формате JSON. Файл можно использовать для переноса на другой сайт или бэкапа.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXPORTS.map(exp => (
            <button
              key={exp.id}
              onClick={() => doExport(exp.id)}
              disabled={!!exporting}
              className={`${exp.color} rounded-xl p-4 text-left transition hover:opacity-90 disabled:opacity-60 flex items-start gap-3`}
            >
              {exporting === exp.id
                ? <Icon name="Loader2" size={20} className="animate-spin shrink-0 mt-0.5" />
                : <Icon name={exp.icon} size={20} className="shrink-0 mt-0.5" />
              }
              <div>
                <div className="font-semibold text-sm">{exp.label}</div>
                <div className="text-xs opacity-80">{exp.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Импорт */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="font-semibold text-base mb-1 flex items-center gap-2">
          <Icon name="Upload" size={18} className="text-amber-600" />
          Импорт данных
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Загрузите JSON-файл, полученный через экспорт. Новые записи будут добавлены, дубли не удаляются.
        </p>

        {importResult && (
          <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${importResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <Icon name={importResult.ok ? 'CheckCircle2' : 'XCircle'} size={16} />
            {importResult.message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {IMPORTS.map(imp => (
            <button
              key={imp.id}
              onClick={() => openImport(imp.id)}
              disabled={!!importing}
              className="border-2 border-dashed border-border rounded-xl p-4 text-left hover:border-brand-blue hover:bg-blue-50 transition disabled:opacity-60 flex items-start gap-3"
            >
              {importing === imp.id
                ? <Icon name="Loader2" size={20} className="animate-spin shrink-0 mt-0.5 text-brand-blue" />
                : <Icon name={imp.icon} size={20} className="shrink-0 mt-0.5 text-muted-foreground" />
              }
              <div>
                <div className="font-semibold text-sm">{imp.label}</div>
                <div className="text-xs text-muted-foreground">{imp.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Предупреждение */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Icon name="AlertTriangle" size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800">
          <div className="font-semibold mb-1">Важно перед импортом</div>
          Импорт добавляет новые записи — существующие данные не удаляются. При переносе на новый сайт сначала сделайте полный экспорт, затем импортируйте на целевом сайте. Настройки (интеграции, ключи API) вводятся вручную из соображений безопасности.
        </div>
      </div>
    </div>
  );
}