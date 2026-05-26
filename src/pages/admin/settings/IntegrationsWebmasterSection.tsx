import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

type CheckStatus = 'idle' | 'checking' | 'ok' | 'err' | 'mismatch';

interface CheckState {
  status: CheckStatus;
  message: string;
}

const idleState: CheckState = { status: 'idle', message: '' };

function StatusBadge({ value, check }: { value: string; check: CheckState }) {
  if (!value) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Circle" size={11} /> Не настроено
    </span>
  );
  if (check.status === 'idle') return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="Clock" size={11} /> Не проверено
    </span>
  );
  if (check.status === 'checking') return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Icon name="Loader2" size={11} className="animate-spin" /> Проверка...
    </span>
  );
  if (check.status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Icon name="CheckCircle2" size={11} /> Подтверждено
    </span>
  );
  if (check.status === 'mismatch') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="AlertTriangle" size={11} /> Тег не совпадает
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <Icon name="XCircle" size={11} /> Не найдено
    </span>
  );
}

async function checkMetaTag(
  siteUrl: string,
  metaName: string,
  expectedContent: string,
): Promise<CheckState> {
  const base = siteUrl.replace(/\/$/, '');
  // Пробуем через CORS-прокси чтобы получить HTML страницы
  const urls = [base + '/', base];
  let html = '';
  let fetchErr = '';
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch (e) {
      fetchErr = e instanceof Error ? e.message : 'Ошибка запроса';
    }
  }

  if (!html) {
    // SPA — пробуем проверить через браузерный DOM (текущий документ)
    const domTag = document.querySelector<HTMLMetaElement>(`meta[name="${metaName}"]`);
    if (domTag) {
      const domContent = (domTag.content || '').trim();
      if (domContent === expectedContent.trim()) {
        return { status: 'ok', message: 'Мета-тег найден на текущей странице' };
      }
      if (domContent) {
        return { status: 'mismatch', message: `Тег есть, но содержимое: «${domContent.slice(0, 60)}»` };
      }
    }
    return {
      status: 'err',
      message: fetchErr || 'Не удалось загрузить страницу. Проверьте URL сайта в настройках.',
    };
  }

  // Ищем мета-тег в полученном HTML
  const re = new RegExp(
    `<meta[^>]+name=["']${metaName}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${metaName}["']`,
    'i',
  );
  const match = html.match(re) || html.match(re2);

  if (!match) {
    return {
      status: 'err',
      message: 'Мета-тег не найден в HTML страницы. Убедитесь, что сохранили настройки.',
    };
  }

  const found = (match[1] || '').trim();
  const expected = expectedContent.trim();

  if (found === expected) {
    return { status: 'ok', message: 'Мета-тег найден и совпадает — поисковая система может подтвердить сайт' };
  }
  if (!found) {
    return {
      status: 'mismatch',
      message: 'Тег найден, но content пустой. Сохраните настройки и дождитесь обновления.',
    };
  }
  return {
    status: 'mismatch',
    message: `Тег найден, но значение не совпадает: «${found.slice(0, 80)}»`,
  };
}

export default function IntegrationsWebmasterSection({ s, setS, saved, save }: Props) {
  const [ymCheck,  setYmCheck]  = useState<CheckState>(idleState);
  const [gscCheck, setGscCheck] = useState<CheckState>(idleState);

  const siteUrl = s.site_url || window.location.origin;

  const runYmCheck = async () => {
    const val = (s.yandex_webmaster_verification || '').trim();
    if (!val) { setYmCheck({ status: 'err', message: 'Введите код подтверждения' }); return; }
    setYmCheck({ status: 'checking', message: '' });
    const result = await checkMetaTag(siteUrl, 'yandex-verification', val);
    setYmCheck(result);
  };

  const runGscCheck = async () => {
    const val = (s.google_search_console_verification || '').trim();
    if (!val) { setGscCheck({ status: 'err', message: 'Введите код подтверждения' }); return; }
    setGscCheck({ status: 'checking', message: '' });
    const result = await checkMetaTag(siteUrl, 'google-site-verification', val);
    setGscCheck(result);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-display font-700 text-lg flex items-center gap-2">
          <Icon name="SearchCheck" size={18} className="text-brand-blue" />
          Инструменты вебмастера
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Коды подтверждения для подключения сайта к поисковым системам — позволяют видеть статистику индексации, ошибки и позиции в поиске.
      </p>

      {/* ── Яндекс Вебмастер ──────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
        ymCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
        : ymCheck.status === 'err' || ymCheck.status === 'mismatch' ? 'border-red-200 bg-red-50/20'
        : 'border-border'
      }`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Яндекс Вебмастер</span>
            <span className="text-xs text-muted-foreground">Статистика индексации в Яндексе</span>
          </div>
          <StatusBadge value={s.yandex_webmaster_verification || ''} check={ymCheck} />
        </div>

        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="Например: 1234567890abcdef"
          value={s.yandex_webmaster_verification || ''}
          onChange={e => { setS({ ...s, yandex_webmaster_verification: e.target.value }); setYmCheck(idleState); }}
        />

        <div className="text-xs text-muted-foreground">
          <a href="https://webmaster.yandex.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">webmaster.yandex.ru</a>
          {' '}→ Добавить сайт → Проверка прав → вкладка <b>«Мета-тег»</b> → скопируйте значение атрибута <code className="bg-muted px-1 rounded">content=""</code>
        </div>

        {ymCheck.status !== 'idle' && ymCheck.status !== 'checking' && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
            ymCheck.status === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <Icon name={ymCheck.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
            <span>{ymCheck.message}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={runYmCheck}
            disabled={ymCheck.status === 'checking' || !s.yandex_webmaster_verification}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40"
          >
            {ymCheck.status === 'checking'
              ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
              : <><Icon name="Zap" size={12} /> Проверить тег на сайте</>
            }
          </button>
          <a
            href="https://webmaster.yandex.ru"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue"
          >
            <Icon name="ExternalLink" size={12} /> Открыть Яндекс Вебмастер
          </a>
        </div>
      </div>

      {/* ── Google Search Console ──────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
        gscCheck.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30'
        : gscCheck.status === 'err' || gscCheck.status === 'mismatch' ? 'border-red-200 bg-red-50/20'
        : 'border-border'
      }`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Google Search Console</span>
            <span className="text-xs text-muted-foreground">Позиции и индексация в Google</span>
          </div>
          <StatusBadge value={s.google_search_console_verification || ''} check={gscCheck} />
        </div>

        <input
          className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-brand-blue outline-none"
          type="text"
          placeholder="Например: AbCdEfGhIjKlMnOpQrSt_1234"
          value={s.google_search_console_verification || ''}
          onChange={e => { setS({ ...s, google_search_console_verification: e.target.value }); setGscCheck(idleState); }}
        />

        <div className="text-xs text-muted-foreground">
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-brand-blue underline">search.google.com/search-console</a>
          {' '}→ Добавить ресурс → HTML-тег → скопируйте значение атрибута <code className="bg-muted px-1 rounded">content=""</code>
        </div>

        {gscCheck.status !== 'idle' && gscCheck.status !== 'checking' && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
            gscCheck.status === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <Icon name={gscCheck.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={13} className="mt-0.5 shrink-0" />
            <span>{gscCheck.message}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={runGscCheck}
            disabled={gscCheck.status === 'checking' || !s.google_search_console_verification}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40"
          >
            {gscCheck.status === 'checking'
              ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверяем...</>
              : <><Icon name="Zap" size={12} /> Проверить тег на сайте</>
            }
          </button>
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue"
          >
            <Icon name="ExternalLink" size={12} /> Открыть Google Search Console
          </a>
        </div>
      </div>

      {/* Подсказка + кнопка сохранения */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
        <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <b>Как подтвердить сайт:</b> вставьте код → нажмите «Сохранить» → через 1–2 минуты нажмите «Проверить тег на сайте».
          Если тег найден — возвращайтесь в Яндекс Вебмастер или Google Search Console и нажмите «Проверить».
        </div>
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20 flex-wrap">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">
          Сохранить
        </button>
        {saved && (
          <span className="text-emerald-600 text-sm flex items-center gap-1">
            <Icon name="CheckCircle2" size={14} /> Сохранено
          </span>
        )}
      </div>
    </div>
  );
}