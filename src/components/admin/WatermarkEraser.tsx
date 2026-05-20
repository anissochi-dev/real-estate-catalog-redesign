/**
 * WatermarkEraser — удаление водяных знаков через ИИ Меланию.
 * Загружает фото, отправляет на бэкенд remove-watermark, показывает результат.
 * Опционально: ручная отметка областей кликом/тачем.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

const REMOVE_WM_URL = 'https://functions.poehali.dev/93965724-e0d4-411d-8100-b9468a1a0627';

interface Region { x: number; y: number; w: number; h: number }

interface Props {
  photoUrl: string;
  onDone: (newUrl: string) => void;
  onClose: () => void;
}

type Step = 'preview' | 'processing' | 'done' | 'error';

export default function WatermarkEraser({ photoUrl, onDone, onClose }: Props) {
  const [step, setStep] = useState<Step>('preview');
  const [resultUrl, setResultUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [sensitivity, setSensitivity] = useState(0.45);
  const [manualMode, setManualMode] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Region | null>(null);
  const [detected, setDetected] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('biznest_token') || '' : '';

  // Рисуем регионы на canvas поверх изображения
  useEffect(() => {
    if (!manualMode) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = 'rgba(239,68,68,0.25)';
    ctx.lineWidth = 3;
    for (const r of regions) {
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    if (currentRect) {
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
    }
  }, [regions, currentRect, manualMode]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!manualMode) return;
    const { x, y } = getCanvasCoords(e);
    setDrawing({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !manualMode) return;
    const { x, y } = getCanvasCoords(e);
    setCurrentRect({ x: drawing.x, y: drawing.y, w: x - drawing.x, h: y - drawing.y });
  };

  const handleMouseUp = () => {
    if (!drawing || !currentRect || !manualMode) return;
    if (Math.abs(currentRect.w) > 5 && Math.abs(currentRect.h) > 5) {
      const normalized: Region = {
        x: currentRect.w < 0 ? currentRect.x + currentRect.w : currentRect.x,
        y: currentRect.h < 0 ? currentRect.y + currentRect.h : currentRect.y,
        w: Math.abs(currentRect.w),
        h: Math.abs(currentRect.h),
      };
      setRegions(r => [...r, normalized]);
    }
    setDrawing(null);
    setCurrentRect(null);
  };

  const process = async () => {
    setStep('processing');
    setErrorMsg('');
    try {
      const body: Record<string, unknown> = { url: photoUrl, sensitivity };
      if (manualMode && regions.length > 0) {
        body.mask_regions = regions;
      }
      const r = await fetch(REMOVE_WM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Ошибка обработки');
      setResultUrl(data.url);
      setDetected(data.detected ?? true);
      setStep('done');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Неизвестная ошибка');
      setStep('error');
    }
  };

  const apply = () => {
    onDone(resultUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Шапка */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
              <Icon name="Wand2" size={15} className="text-violet-600" />
            </div>
            <div>
              <div className="font-display font-700 text-sm">Мелания убирает водяной знак</div>
              <div className="text-[11px] text-muted-foreground">ИИ-обработка фотографии</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Превью и результат */}
          {(step === 'preview' || step === 'processing') && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-muted select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{ cursor: manualMode ? 'crosshair' : 'default' }}
              >
                <img ref={imgRef} src={photoUrl} alt="Фото" className="w-full object-contain max-h-72" />
                {manualMode && (
                  <canvas ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                {step === 'processing' && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 border-4 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                    <div className="text-white text-sm font-semibold">Мелания обрабатывает...</div>
                    <div className="text-white/60 text-xs">Обычно 10–20 секунд</div>
                  </div>
                )}
              </div>

              {/* Настройки */}
              {step === 'preview' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Icon name="SlidersHorizontal" size={13} />
                        Чувствительность детекции
                        <span className="text-muted-foreground font-normal ml-1">{Math.round(sensitivity * 100)}%</span>
                      </label>
                      <input type="range" min={10} max={90} step={5}
                        value={Math.round(sensitivity * 100)}
                        onChange={e => setSensitivity(Number(e.target.value) / 100)}
                        className="w-full mt-1 accent-violet-600"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                        <span>Мягко</span><span>Агрессивно</span>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                    <input type="checkbox" checked={manualMode} onChange={e => { setManualMode(e.target.checked); setRegions([]); }}
                      className="rounded accent-violet-600" />
                    <span>Отметить области вручную</span>
                    <span className="text-xs text-muted-foreground">(рисуйте прямоугольники на фото)</span>
                  </label>

                  {manualMode && regions.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 px-3 py-1.5 rounded-lg">
                      <Icon name="CheckSquare" size={13} />
                      Отмечено {regions.length} {regions.length === 1 ? 'область' : 'областей'}
                      <button onClick={() => setRegions([])} className="ml-auto underline hover:no-underline">
                        Очистить
                      </button>
                    </div>
                  )}

                  <button
                    onClick={process}
                    disabled={manualMode && regions.length === 0 && false}
                    className="w-full py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition flex items-center justify-center gap-2"
                  >
                    <Icon name="Sparkles" size={16} />
                    Убрать водяной знак
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Результат */}
          {step === 'done' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">До</div>
                  <img src={photoUrl} alt="До" className="w-full rounded-xl object-cover aspect-video" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">После</div>
                  <img src={resultUrl} alt="После" className="w-full rounded-xl object-cover aspect-video" />
                </div>
              </div>

              {detected === false && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                  <Icon name="Info" size={15} />
                  Водяной знак не обнаружен автоматически. Попробуйте ручной режим или увеличьте чувствительность.
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={apply}
                  className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2">
                  <Icon name="Check" size={16} />
                  Применить
                </button>
                <button onClick={() => { setStep('preview'); setRegions([]); setManualMode(false); }}
                  className="px-4 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted">
                  Повторить
                </button>
                <button onClick={onClose} className="px-4 py-2.5 border border-border rounded-xl text-sm hover:bg-muted">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Ошибка */}
          {step === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Icon name="AlertCircle" size={18} className="text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-sm text-red-700">Ошибка обработки</div>
                  <div className="text-xs text-red-600 mt-0.5">{errorMsg}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('preview')}
                  className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm hover:opacity-90">
                  Попробовать снова
                </button>
                <button onClick={onClose} className="px-4 py-2.5 border border-border rounded-xl text-sm hover:bg-muted">
                  Закрыть
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
