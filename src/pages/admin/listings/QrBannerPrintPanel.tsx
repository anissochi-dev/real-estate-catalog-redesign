import { useRef, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { copyText } from '@/lib/clipboard';
import { generatePrintBanner, PrintBannerResult } from '@/lib/adminApi';

type Material = 'paper' | 'fabric' | 'none';

const MATERIALS: { id: Material; label: string; bleed: number; hint: string }[] = [
  { id: 'paper',  label: 'Бумага / плёнка', bleed: 3,  hint: 'вылеты 3 мм' },
  { id: 'fabric', label: 'Баннерная ткань', bleed: 50, hint: 'запас 50 мм под люверсы' },
  { id: 'none',   label: 'Без вылетов',     bleed: 0,  hint: 'точно в размер' },
];

const MAX_MP = 150;

function autoDpi(wCm: number, hCm: number) {
  const longest = Math.max(wCm, hCm);
  return longest <= 100 ? 150 : longest <= 300 ? 100 : 72;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const mb = (b: number) => `${fmt(b / 1048576)} МБ`;

function CmykInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder="авто"
      className="w-full px-2 py-1.5 border border-border rounded-lg text-xs font-mono focus:border-brand-blue outline-none" />
  );
}

function parseCmyk(v: string): number[] | null {
  const parts = v.split(/[\s,;/]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 100)) return null;
  return parts;
}

interface Props {
  widthCm: number;
  heightCm: number;
  disabled: boolean;
  buildParams: () => Record<string, unknown>;
  issuesCount: number;
  listingId?: number;
  listingTitle?: string;
}

export function PrintPanel({ widthCm, heightCm, disabled, buildParams, issuesCount, listingId, listingTitle }: Props) {
  const [material, setMaterial] = useState<Material>('paper');
  const [dpiMode, setDpiMode] = useState<'auto' | number>('auto');
  const [bgCmyk, setBgCmyk] = useState('');
  const [textCmyk, setTextCmyk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PrintBannerResult | null>(null);
  const [sentMaterial, setSentMaterial] = useState<Material>('paper');
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const bleed = MATERIALS.find(m => m.id === material)!.bleed;
  const dpi = dpiMode === 'auto' ? autoDpi(widthCm, heightCm) : dpiMode;
  const fullW = widthCm + bleed / 5;
  const fullH = heightCm + bleed / 5;
  const pxW = Math.round((fullW / 2.54) * dpi);
  const pxH = Math.round((fullH / 2.54) * dpi);
  const mp = (pxW * pxH) / 1e6;
  const tooBig = mp > MAX_MP;
  const bgBad = bgCmyk.trim() !== '' && !parseCmyk(bgCmyk);
  const textBad = textCmyk.trim() !== '' && !parseCmyk(textCmyk);

  const generate = async () => {
    setBusy(true); setError(''); setResult(null); setCopied(false); setShowText(false); setSentMaterial(material);
    try {
      const params = {
        ...buildParams(),
        bleed_mm: bleed,
        dpi,
        ...(parseCmyk(bgCmyk) ? { bg_cmyk: parseCmyk(bgCmyk) } : {}),
        ...(parseCmyk(textCmyk) ? { text_cmyk: parseCmyk(textCmyk) } : {}),
      };
      setResult(await generatePrintBanner(params));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally { setBusy(false); }
  };

  const fileName = (url: string) => decodeURIComponent(url.split('/').pop() || 'banner.tif');

  const buildMessage = (r: PrintBannerResult) => {
    const i = r.info;
    const m = MATERIALS.find(x => x.id === sentMaterial)!;
    const lines = [
      'Заказ печати баннера',
      '',
      listingId ? `Объект: №${listingId}${listingTitle ? ` — ${listingTitle}` : ''}` : '',
      `Готовый размер: ${fmt(i.width_cm)} × ${fmt(i.height_cm)} см`,
      i.bleed_mm > 0 ? `Размер с вылетами: ${fmt(i.full_width_cm)} × ${fmt(i.full_height_cm)} см (вылеты ${i.bleed_mm} мм)` : 'Вылеты: нет, точно в размер',
      m.id === 'none' ? '' : `Материал: ${m.label}${m.id === 'fabric' ? ' (запас 50 мм под люверсы)' : ''}`,
      '',
      `Формат файла: TIFF, CMYK, профиль ISO Coated v2 (FOGRA39), сжатие LZW`,
      `Разрешение: ${i.dpi} dpi`,
      `Размер в пикселях: ${i.px_w.toLocaleString('ru')} × ${i.px_h.toLocaleString('ru')} px`,
      `Вес файла: ${mb(r.size)}`,
      `Имя файла: ${fileName(r.url)}`,
      i.bg_cmyk ? `Цвет фона CMYK: ${i.bg_cmyk.join('/')}` : '',
      i.text_cmyk ? `Цвет текста и QR CMYK: ${i.text_cmyk.join('/')}` : '',
      i.qr_side_cm ? `QR-код: ${fmt(i.qr_side_cm)} см, модуль ${fmt(i.qr_module_mm ?? 0)} мм — не масштабировать и не обрезать, иначе код может не считаться` : '',
      '',
      `Скачать файл: ${r.url}`,
      `Ссылка действует до ${new Date(r.expires_at).toLocaleDateString('ru')}`,
    ];
    return lines.filter((l, idx) => l !== '' || (idx > 0 && lines[idx - 1] !== '')).join('\n').trim();
  };

  const copyMessage = async (text: string) => {
    const ok = await copyText(text, rootRef.current);
    if (ok) {
      setCopied(true);
      toast.success('Текст заказа скопирован — вставьте его в мессенджер или письмо типографии');
      setTimeout(() => setCopied(false), 2500);
    } else {
      setShowText(true);
      toast.info('Браузер запретил копирование — скопируйте текст из поля ниже');
      setTimeout(() => textRef.current?.select(), 50);
    }
  };

  const sendToPrint = async (r: PrintBannerResult) => {
    const text = buildMessage(r);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Баннер для печати${listingId ? ` — объект №${listingId}` : ''}`, text });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    copyMessage(text);
  };

  return (
    <div ref={rootRef} className="border-2 border-emerald-500/30 bg-emerald-50/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="Printer" size={15} className="text-emerald-700" />
        <span className="text-sm font-semibold text-emerald-800">Файл для печати (TIFF, CMYK)</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MATERIALS.map(m => (
          <button key={m.id} onClick={() => setMaterial(m.id)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left ${
              material === m.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-border text-muted-foreground hover:border-emerald-500'
            }`}
          >
            <div className="font-semibold">{m.label}</div>
            <div className="opacity-75">{m.hint}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Разрешение:</span>
        {(['auto', 72, 100, 150, 300] as const).map(v => (
          <button key={String(v)} onClick={() => setDpiMode(v)}
            className={`px-2 py-1 rounded-md border ${
              dpiMode === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-border text-muted-foreground hover:border-emerald-500'
            }`}
          >{v === 'auto' ? `Авто (${autoDpi(widthCm, heightCm)})` : `${v} dpi`}</button>
        ))}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Точные цвета в CMYK (необязательно)</summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <div className="text-muted-foreground mb-1">Фон, C M Y K %</div>
            <CmykInput value={bgCmyk} onChange={setBgCmyk} />
            {bgBad && <div className="text-red-600 mt-0.5">4 числа от 0 до 100</div>}
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Текст и QR, C M Y K %</div>
            <CmykInput value={textCmyk} onChange={setTextCmyk} />
            {textBad && <div className="text-red-600 mt-0.5">4 числа от 0 до 100</div>}
          </div>
        </div>
        <div className="text-muted-foreground mt-1">Пусто — цвет переводится автоматически по профилю ISO Coated v2 (FOGRA39).</div>
      </details>

      <div className={`text-xs rounded-lg px-3 py-2 ${tooBig ? 'bg-red-50 text-red-700' : 'bg-white text-muted-foreground'} border border-border`}>
        Готовый размер <b className="text-foreground">{fmt(widthCm)} × {fmt(heightCm)} см</b>
        {bleed > 0 && <> · с вылетами <b className="text-foreground">{fmt(fullW)} × {fmt(fullH)} см</b></>}
        {' '}· {pxW.toLocaleString('ru')} × {pxH.toLocaleString('ru')} px · {dpi} dpi
        {tooBig && <div className="mt-1 font-semibold">Слишком большой файл ({fmt(mp)} Мп, максимум {MAX_MP}) — выберите меньшее разрешение.</div>}
      </div>

      {issuesCount > 0 && (
        <div className="text-xs text-amber-700 flex items-center gap-1.5">
          <Icon name="TriangleAlert" size={12} />Есть элементы у края баннера — проверьте предупреждения в редакторе
        </div>
      )}

      <button onClick={generate} disabled={disabled || busy || tooBig || bgBad || textBad}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
      >
        {busy
          ? <><Icon name="Loader2" size={15} className="animate-spin" />Готовлю файл{mp > 30 ? ' (до 20 сек)' : ''}…</>
          : <><Icon name="FileDown" size={15} />Подготовить TIFF для типографии</>}
      </button>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {result && (
        <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-2 text-xs">
          <div className="flex gap-3">
            <img src={result.preview_url} alt="Пробный оттиск" className="w-32 h-auto rounded border border-border flex-shrink-0 self-start" />
            <div className="space-y-1 min-w-0">
              <div className="font-semibold text-emerald-800 flex items-center gap-1.5">
                <Icon name="CircleCheck" size={13} />Файл готов{result.cached ? ' (макет не менялся — тот же файл)' : ''}
              </div>
              {listingId && <div className="text-muted-foreground">Объект <b className="text-foreground">№{listingId}</b></div>}
              <div className="text-muted-foreground">
                Формат <b className="text-foreground">TIFF</b> · вес <b className="text-foreground">{mb(result.size)}</b> · <b className="text-foreground">{result.info.dpi} dpi</b>
              </div>
              <div className="text-muted-foreground">
                Размер <b className="text-foreground">{result.info.px_w.toLocaleString('ru')} × {result.info.px_h.toLocaleString('ru')} px</b> · {fmt(result.info.full_width_cm)} × {fmt(result.info.full_height_cm)} см
              </div>
              <div className="text-muted-foreground">CMYK · профиль ISO Coated v2 (FOGRA39) · сжатие LZW</div>
              {result.info.qr_side_cm && (
                <div className="text-muted-foreground">QR-код {fmt(result.info.qr_side_cm)} см, модуль {fmt(result.info.qr_module_mm ?? 0)} мм</div>
              )}
              {result.info.bg_cmyk && (
                <div className="text-muted-foreground">Фон CMYK {result.info.bg_cmyk.join('/')} · текст {result.info.text_cmyk?.join('/')}</div>
              )}
              <div className="text-amber-700">Ссылка действует до {new Date(result.expires_at).toLocaleDateString('ru')}</div>
            </div>
          </div>
          {result.info.warnings?.map(w => <div key={w} className="text-amber-700">{w}</div>)}
          <div className="text-muted-foreground">Слева — пробный оттиск: так цвета будут выглядеть на печати.</div>
          <div className="flex gap-2">
            <a href={result.url} download
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
            ><Icon name="Download" size={13} />Скачать TIFF</a>
            <button type="button" onClick={() => sendToPrint(result)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-semibold transition ${
                copied ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50'
              }`}
            ><Icon name={copied ? 'Check' : 'Send'} size={13} />{copied ? 'Текст скопирован' : 'Отправить в типографию'}</button>
          </div>
          {showText && (
            <textarea ref={textRef} readOnly value={buildMessage(result)} rows={10} onFocus={e => e.currentTarget.select()}
              className="w-full px-2 py-1.5 border border-emerald-300 rounded-lg text-xs font-mono bg-emerald-50/50" />
          )}
        </div>
      )}
    </div>
  );
}