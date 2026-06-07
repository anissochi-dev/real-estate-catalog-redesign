import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { CONDITIONS, BUILDING_CLASSES, FINISHING } from '@/pages/admin/listings/types';
import type { Listing } from '@/pages/admin/listings/types';

const PHOTO_AUDIT_URL = 'https://functions.poehali.dev/ccf52d36-5d2e-4b2a-8a40-e747dc90080f';

interface AuditResult {
  score: number;
  condition: string;
  building_class: string;
  finishing: string;
  price_per_m2_min: number;
  price_per_m2_max: number;
  rent_per_m2_min: number;
  rent_per_m2_max: number;
  pros: string[];
  cons: string[];
  recommendations: string[];
  photo_tips: string[];
  summary: string;
}

interface Props {
  photos: string[];
  editing: Partial<Listing>;
  onApply: (fields: Partial<Listing>) => void;
  auditUrl?: string;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

function scoreColor(s: number) {
  if (s >= 8) return 'text-emerald-600';
  if (s >= 6) return 'text-amber-500';
  if (s >= 4) return 'text-orange-500';
  return 'text-red-500';
}
function scoreBg(s: number) {
  if (s >= 8) return 'bg-emerald-50 border-emerald-200';
  if (s >= 6) return 'bg-amber-50 border-amber-200';
  if (s >= 4) return 'bg-orange-50 border-orange-200';
  return 'bg-red-50 border-red-200';
}
function scoreLabel(s: number) {
  if (s >= 9) return 'Отлично';
  if (s >= 7) return 'Хорошее';
  if (s >= 5) return 'Среднее';
  if (s >= 3) return 'Плохое';
  return 'Критичное';
}
function fmtPrice(n: number) {
  return n ? n.toLocaleString('ru-RU') + ' ₽' : '—';
}

// Маппинг текстовых значений ИИ → коды из types.ts
const CONDITION_MAP: Record<string, string> = {
  'черновая': 'shellcore',
  'черновая отделка': 'shellcore',
  'без отделки': 'rough',
  'требует ремонта': 'cosmetic',
  'требуется косметика': 'cosmetic',
  'удовлетворительное': 'good',
  'хорошее': 'good',
  'евроремонт': 'euro',
  'люкс': 'euro',
  'новое': 'new',
};

const FINISHING_MAP: Record<string, string> = {
  'черновая': 'rough',
  'черновая отделка': 'rough',
  'без отделки': 'none',
  'предчистовая': 'pre_finish',
  'косметический ремонт': 'cosmetic',
  'евроремонт': 'euro',
  'дизайнерский': 'designer',
  'дизайнерский ремонт': 'designer',
};

const CLASS_MAP: Record<string, string> = {
  'a': 'A', 'a+': 'A+', 'b+': 'B+', 'b': 'B', 'c': 'C',
};

function conditionLabel(code: string) {
  return CONDITIONS.find(([v]) => v === code)?.[1] ?? code;
}
function classLabel(code: string) {
  return BUILDING_CLASSES.find(([v]) => v === code)?.[1] ?? `Класс ${code}`;
}
function finishingLabel(code: string) {
  return FINISHING.find(([v]) => v === code)?.[1] ?? code;
}

export default function PhotoAuditPanel({ photos, editing, onApply, auditUrl }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  const url = auditUrl || PHOTO_AUDIT_URL;

  const runAudit = async () => {
    if (!photos.length) return;
    setStatus('loading');
    setResult(null);
    setError('');
    setApplied(false);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_urls: photos,
          category: editing.category,
          area: editing.area,
          city: editing.city,
          deal: editing.deal,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Ошибка анализа');
      setResult(data.audit);
      setStatus('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
      setStatus('error');
    }
  };

  // Применить характеристики в форму
  const applyToForm = () => {
    if (!result) return;
    const fields: Partial<Listing> = {};

    const condKey = CONDITION_MAP[result.condition?.toLowerCase() ?? ''];
    if (condKey) fields.condition = condKey;

    const classKey = CLASS_MAP[result.building_class?.toLowerCase() ?? ''];
    if (classKey) fields.building_class = classKey;

    const finKey = FINISHING_MAP[result.finishing?.toLowerCase() ?? ''];
    if (finKey) fields.finishing = finKey;

    onApply(fields);
    setApplied(true);
  };

  if (photos.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">

      {/* Шапка с кнопкой */}
      <div className="flex items-center justify-between px-4 py-3 bg-violet-100/80 border-b border-violet-200">
        <div className="flex items-center gap-2">
          <Icon name="ScanEye" size={16} className="text-violet-600" />
          <span className="text-sm font-semibold text-violet-900">ИИ-анализ объекта</span>
          <span className="text-[11px] text-violet-500">{photos.length} фото</span>
        </div>

        <button
          onClick={runAudit}
          disabled={status === 'loading'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
            bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'loading'
            ? <><Icon name="Loader2" size={12} className="animate-spin" />Анализирую…</>
            : <><Icon name="Sparkles" size={12} />Анализировать фото</>
          }
        </button>
      </div>

      {/* Подсказка при idle */}
      {status === 'idle' && (
        <div className="px-4 py-3 text-xs text-violet-500 flex items-center gap-2">
          <Icon name="Info" size={13} />
          Нажмите «Анализировать фото» — ИИ изучит все {photos.length} фото и выдаст оценку состояния, класс объекта, ценовой диапазон и рекомендации.
        </div>
      )}

      {/* Ошибка */}
      {status === 'error' && (
        <div className="px-4 py-3 flex items-start gap-2 text-xs text-red-600">
          <Icon name="AlertCircle" size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Ошибка анализа</div>
            <div className="text-red-500 mt-0.5">{error}</div>
            <button onClick={runAudit} className="mt-1.5 underline text-red-600 hover:text-red-700">Попробовать снова</button>
          </div>
        </div>
      )}

      {/* Результат */}
      {status === 'done' && result && (
        <div className="p-4 space-y-4">

          {/* Балл + сводка */}
          <div className={`flex items-start gap-4 p-3 rounded-xl border ${scoreBg(result.score)}`}>
            <div className="text-center shrink-0">
              <div className={`text-3xl font-black ${scoreColor(result.score)}`}>{result.score}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">из 10</div>
              <div className={`text-[11px] font-semibold mt-0.5 ${scoreColor(result.score)}`}>{scoreLabel(result.score)}</div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>
            </div>
          </div>

          {/* Характеристики + кнопка применить */}
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
              <span className="text-xs font-semibold">Определённые характеристики</span>
              <button
                onClick={applyToForm}
                disabled={applied}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors
                  ${applied
                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
                  }`}
              >
                {applied
                  ? <><Icon name="Check" size={12} />Применено</>
                  : <><Icon name="ArrowDownToLine" size={12} />Вставить в объект</>
                }
              </button>
            </div>
            <div className="divide-y divide-border text-xs">
              {result.condition && (
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Состояние</span>
                  <span className="font-semibold">
                    {conditionLabel(CONDITION_MAP[result.condition.toLowerCase()] || '') || result.condition}
                  </span>
                </div>
              )}
              {result.building_class && result.building_class !== 'не определён' && (
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Класс здания</span>
                  <span className="font-semibold">
                    {classLabel(CLASS_MAP[result.building_class.toLowerCase()] || result.building_class)}
                  </span>
                </div>
              )}
              {result.finishing && (
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Отделка</span>
                  <span className="font-semibold">
                    {finishingLabel(FINISHING_MAP[result.finishing.toLowerCase()] || '') || result.finishing}
                  </span>
                </div>
              )}
              {result.price_per_m2_min > 0 && (
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Продажа/м²</span>
                  <span className="font-semibold text-emerald-700">
                    {fmtPrice(result.price_per_m2_min)} — {fmtPrice(result.price_per_m2_max)}
                  </span>
                </div>
              )}
              {result.rent_per_m2_min > 0 && (
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground">Аренда/м²/мес</span>
                  <span className="font-semibold text-blue-700">
                    {fmtPrice(result.rent_per_m2_min)} — {fmtPrice(result.rent_per_m2_max)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Плюсы и минусы */}
          {(result.pros.length > 0 || result.cons.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {result.pros.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mb-2">
                    <Icon name="ThumbsUp" size={12} /> Сильные стороны
                  </div>
                  <ul className="space-y-1">
                    {result.pros.map((p, i) => (
                      <li key={i} className="text-[11px] text-emerald-800 flex items-start gap-1">
                        <span className="shrink-0 text-emerald-500 mt-0.5">✓</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.cons.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 mb-2">
                    <Icon name="ThumbsDown" size={12} /> Слабые стороны
                  </div>
                  <ul className="space-y-1">
                    {result.cons.map((c, i) => (
                      <li key={i} className="text-[11px] text-red-700 flex items-start gap-1">
                        <span className="shrink-0 text-red-400 mt-0.5">✗</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Рекомендации по объекту */}
          {result.recommendations.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-2">
                <Icon name="Lightbulb" size={12} /> Рекомендации по объекту
              </div>
              <ol className="space-y-1">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                    <span className="shrink-0 text-amber-500 font-bold mt-0.5">{i + 1}.</span>{r}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Советы по фото */}
          {result.photo_tips && result.photo_tips.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 mb-2">
                <Icon name="Camera" size={12} /> Советы по фотосъёмке
              </div>
              <ul className="space-y-1">
                {result.photo_tips.map((t, i) => (
                  <li key={i} className="text-[11px] text-sky-800 flex items-start gap-1">
                    <span className="shrink-0 text-sky-400 mt-0.5">·</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Повторный анализ */}
          <button
            onClick={runAudit}
            className="w-full text-xs text-violet-500 hover:text-violet-700 py-1 flex items-center justify-center gap-1 transition-colors"
          >
            <Icon name="RefreshCw" size={11} /> Повторить анализ
          </button>
        </div>
      )}
    </div>
  );
}
