import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';

const PHOTO_AUDIT_URL = 'https://functions.poehali.dev/ccf52d36-5d2e-4b2a-8a40-e747dc90080f';

interface AuditResult {
  score: number;
  condition: string;
  building_class: string;
  price_per_m2_min: number;
  price_per_m2_max: number;
  rent_per_m2_min: number;
  rent_per_m2_max: number;
  pros: string[];
  cons: string[];
  recommendations: string[];
  summary: string;
}

interface PhotoAudit {
  url: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  result?: AuditResult;
  error?: string;
}

interface Props {
  photos: string[];
  category?: string;
  area?: number;
  city?: string;
  auditUrl: string;
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-emerald-600';
  if (score >= 6) return 'text-amber-500';
  if (score >= 4) return 'text-orange-500';
  return 'text-red-500';
}

function scoreLabel(score: number) {
  if (score === 0) return 'Не определено';
  if (score >= 9) return 'Отлично';
  if (score >= 7) return 'Хорошее';
  if (score >= 5) return 'Среднее';
  if (score >= 3) return 'Плохое';
  return 'Критичное';
}

function fmtPrice(n: number) {
  if (!n) return '—';
  return n.toLocaleString('ru-RU') + ' ₽';
}

export default function PhotoAuditPanel({ photos, category, area, city, auditUrl }: Props) {
  const [audits, setAudits] = useState<Record<string, PhotoAudit>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [globalDone, setGlobalDone] = useState(false);

  const runAudit = useCallback(async (url: string) => {
    setAudits(prev => ({ ...prev, [url]: { url, status: 'loading' } }));
    try {
      const res = await fetch(auditUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, category, area, city }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Ошибка анализа');
      setAudits(prev => ({ ...prev, [url]: { url, status: 'done', result: data.audit } }));
    } catch (e: unknown) {
      setAudits(prev => ({
        ...prev,
        [url]: { url, status: 'error', error: e instanceof Error ? e.message : 'Ошибка' },
      }));
    }
  }, [auditUrl, category, area, city]);

  // Авто-запуск для новых фото (которые ещё не в audits)
  useEffect(() => {
    photos.forEach(url => {
      if (!audits[url]) {
        runAudit(url);
      }
    });
  }, [photos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Проверяем завершение всех
  useEffect(() => {
    if (photos.length === 0) return;
    const allDone = photos.every(u => audits[u]?.status === 'done' || audits[u]?.status === 'error');
    setGlobalDone(allDone);
  }, [audits, photos]);

  if (photos.length === 0) return null;

  const doneCount = photos.filter(u => audits[u]?.status === 'done').length;
  const loadingCount = photos.filter(u => audits[u]?.status === 'loading').length;

  // Общая сводка по всем фото
  const allResults = photos.map(u => audits[u]?.result).filter(Boolean) as AuditResult[];
  const avgScore = allResults.length
    ? Math.round(allResults.reduce((s, r) => s + r.score, 0) / allResults.length)
    : null;
  const bestCondition = allResults.length
    ? allResults.sort((a, b) => b.score - a.score)[0]?.condition
    : null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 overflow-hidden mt-3">
      {/* Шапка */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-violet-100/70 border-b border-violet-200">
        <div className="flex items-center gap-2">
          <Icon name="ScanEye" size={15} className="text-violet-600" />
          <span className="text-sm font-semibold text-violet-900">ИИ-аудит фотографий</span>
          {loadingCount > 0 && (
            <span className="text-[11px] text-violet-600 flex items-center gap-1">
              <Icon name="Loader2" size={11} className="animate-spin" />
              Анализирую {loadingCount} фото…
            </span>
          )}
          {globalDone && avgScore !== null && (
            <span className={`text-sm font-bold ${scoreColor(avgScore)}`}>
              {avgScore}/10 · {scoreLabel(avgScore)}
            </span>
          )}
        </div>
        <div className="text-[11px] text-violet-500">{doneCount}/{photos.length} проанализировано</div>
      </div>

      {/* Общая сводка */}
      {globalDone && allResults.length > 0 && (
        <div className="px-3 py-2 border-b border-violet-200 bg-white/50 flex flex-wrap gap-4 text-xs">
          {bestCondition && (
            <div>
              <span className="text-muted-foreground">Состояние: </span>
              <span className="font-semibold capitalize">{bestCondition}</span>
            </div>
          )}
          {allResults[0]?.building_class && allResults[0].building_class !== 'не определён' && (
            <div>
              <span className="text-muted-foreground">Класс: </span>
              <span className="font-semibold">{allResults[0].building_class}</span>
            </div>
          )}
          {allResults[0]?.price_per_m2_min > 0 && (
            <div>
              <span className="text-muted-foreground">Продажа/м²: </span>
              <span className="font-semibold">
                {fmtPrice(allResults[0].price_per_m2_min)} – {fmtPrice(allResults[0].price_per_m2_max)}
              </span>
            </div>
          )}
          {allResults[0]?.rent_per_m2_min > 0 && (
            <div>
              <span className="text-muted-foreground">Аренда/м²: </span>
              <span className="font-semibold">
                {fmtPrice(allResults[0].rent_per_m2_min)} – {fmtPrice(allResults[0].rent_per_m2_max)}/мес
              </span>
            </div>
          )}
        </div>
      )}

      {/* Список фото с результатами */}
      <div className="divide-y divide-violet-100">
        {photos.map((url, idx) => {
          const audit = audits[url];
          const isOpen = expanded === url;

          return (
            <div key={url + idx}>
              <button
                onClick={() => audit?.status === 'done' ? setExpanded(isOpen ? null : url) : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                  ${audit?.status === 'done' ? 'hover:bg-violet-100/50 cursor-pointer' : 'cursor-default'}`}
              >
                {/* Миниатюра */}
                <img src={url} alt="" className="w-12 h-10 object-cover rounded-md shrink-0 border border-violet-200" />

                {/* Статус / результат */}
                <div className="flex-1 min-w-0">
                  {audit?.status === 'loading' && (
                    <div className="flex items-center gap-1.5 text-xs text-violet-600">
                      <Icon name="Loader2" size={12} className="animate-spin" />
                      Анализирую…
                    </div>
                  )}
                  {audit?.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-xs text-red-500">
                      <Icon name="AlertCircle" size={12} />
                      <span className="truncate">{audit.error}</span>
                    </div>
                  )}
                  {audit?.status === 'done' && audit.result && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`font-bold text-sm ${scoreColor(audit.result.score)}`}>
                        {audit.result.score}/10
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{audit.result.condition}</span>
                      {audit.result.building_class !== 'не определён' && (
                        <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                          Класс {audit.result.building_class}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground truncate hidden sm:block">{audit.result.summary}</span>
                    </div>
                  )}
                  {!audit && (
                    <div className="text-xs text-muted-foreground">Ожидает…</div>
                  )}
                </div>

                {audit?.status === 'done' && (
                  <Icon name={isOpen ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-violet-400 shrink-0" />
                )}
              </button>

              {/* Развёрнутые детали */}
              {isOpen && audit?.result && (
                <div className="px-4 pb-3 pt-1 bg-white/60 space-y-3 text-xs">
                  {audit.result.summary && (
                    <p className="text-muted-foreground italic">{audit.result.summary}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {audit.result.pros.length > 0 && (
                      <div>
                        <div className="font-semibold text-emerald-700 mb-1 flex items-center gap-1">
                          <Icon name="ThumbsUp" size={11} /> Плюсы
                        </div>
                        <ul className="space-y-0.5">
                          {audit.result.pros.map((p, i) => (
                            <li key={i} className="text-emerald-800 flex items-start gap-1">
                              <span className="shrink-0 mt-0.5">·</span>{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {audit.result.cons.length > 0 && (
                      <div>
                        <div className="font-semibold text-red-600 mb-1 flex items-center gap-1">
                          <Icon name="ThumbsDown" size={11} /> Минусы
                        </div>
                        <ul className="space-y-0.5">
                          {audit.result.cons.map((c, i) => (
                            <li key={i} className="text-red-700 flex items-start gap-1">
                              <span className="shrink-0 mt-0.5">·</span>{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {audit.result.recommendations.length > 0 && (
                    <div>
                      <div className="font-semibold text-amber-700 mb-1 flex items-center gap-1">
                        <Icon name="Lightbulb" size={11} /> Рекомендации
                      </div>
                      <ul className="space-y-0.5">
                        {audit.result.recommendations.map((r, i) => (
                          <li key={i} className="text-amber-800 flex items-start gap-1">
                            <span className="shrink-0 mt-0.5">{i + 1}.</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}