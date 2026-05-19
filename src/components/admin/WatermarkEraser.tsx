import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { removeWatermark } from '@/lib/adminApi';

interface Rect { x: number; y: number; w: number; h: number }

interface Props {
  photoUrl: string;
  onDone: (newUrl: string) => void;
  onClose: () => void;
}

export default function WatermarkEraser({ photoUrl, onDone, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<Rect | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.45);
  const [autoMode, setAutoMode] = useState(false);

  // Размеры canvas совпадают с отображаемым изображением
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
    };
    img.src = photoUrl;
  }, [photoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current || !imgLoaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    for (const r of rects) {
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    if (current) {
      ctx.fillRect(current.x, current.y, current.w, current.h);
      ctx.strokeRect(current.x, current.y, current.w, current.h);
    }
  }, [rects, current, imgLoaded, canvasSize]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    setDrawing(true);
    setStart(pos);
    setCurrent(null);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !start) return;
    const pos = getPos(e);
    setCurrent({
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    });
  };

  const onMouseUp = () => {
    if (current && current.w > 5 && current.h > 5) {
      setRects(prev => [...prev, current]);
    }
    setDrawing(false);
    setStart(null);
    setCurrent(null);
  };

  // Переводим координаты canvas → пиксели оригинального фото
  const toNatural = (r: Rect): Rect => {
    const scaleX = naturalSize.w / canvasSize.w;
    const scaleY = naturalSize.h / canvasSize.h;
    return {
      x: Math.round(r.x * scaleX),
      y: Math.round(r.y * scaleY),
      w: Math.round(r.w * scaleX),
      h: Math.round(r.h * scaleY),
    };
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      const regions = autoMode ? undefined : rects.map(toNatural);
      const { url, detected } = await removeWatermark(photoUrl, sensitivity, regions?.length ? regions : undefined);
      if (!autoMode && !regions?.length) {
        alert('Выделите область с водяным знаком');
        return;
      }
      onDone(url);
      if (!detected && autoMode) alert('Автодетекция не нашла водяных знаков. Попробуйте выделить область вручную.');
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-3xl w-full max-h-[95vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <div className="font-display font-700 text-base">Убрать водяной знак</div>
            <div className="text-xs text-muted-foreground">Выделите область с водяным знаком мышью</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><Icon name="X" size={18} /></button>
        </div>

        {/* Режим */}
        <div className="px-5 pt-3 flex items-center gap-4 shrink-0 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!autoMode} onChange={() => setAutoMode(false)} />
            <span className="text-sm font-semibold">Вручную</span>
            <span className="text-xs text-muted-foreground">— нарисуйте прямоугольник(и) над знаком</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={autoMode} onChange={() => setAutoMode(true)} />
            <span className="text-sm font-semibold">Авто</span>
            <span className="text-xs text-muted-foreground">— ИИ найдёт сам</span>
          </label>
          {autoMode && (
            <label className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">Чувствительность</span>
              <input type="range" min={0.1} max={0.9} step={0.05} value={sensitivity}
                onChange={e => setSensitivity(parseFloat(e.target.value))}
                className="w-24" />
              <span className="text-xs w-8">{Math.round(sensitivity * 100)}%</span>
            </label>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-0">
          {!imgLoaded ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon name="Loader2" size={20} className="animate-spin" /> Загрузка фото...
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={canvasSize.w || 700}
              height={canvasSize.h || 400}
              className={`rounded-lg border border-border max-w-full max-h-[55vh] object-contain ${!autoMode ? 'cursor-crosshair' : 'cursor-default'}`}
              style={{ display: 'block' }}
              onMouseDown={!autoMode ? onMouseDown : undefined}
              onMouseMove={!autoMode ? onMouseMove : undefined}
              onMouseUp={!autoMode ? onMouseUp : undefined}
              ref={el => {
                (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
                if (el && imgRef.current && !canvasSize.w) {
                  const maxW = Math.min(700, window.innerWidth - 80);
                  const aspect = imgRef.current.naturalHeight / imgRef.current.naturalWidth;
                  const w = maxW;
                  const h = Math.round(w * aspect);
                  setCanvasSize({ w, h });
                  el.width = w;
                  el.height = h;
                }
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-3 shrink-0 flex-wrap">
          {!autoMode && rects.length > 0 && (
            <button onClick={() => setRects([])}
              className="text-sm text-muted-foreground hover:text-red-500 flex items-center gap-1">
              <Icon name="Trash2" size={14} /> Очистить ({rects.length})
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">
              Отмена
            </button>
            <button
              onClick={handleApply}
              disabled={loading || (!autoMode && rects.length === 0)}
              className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <><Icon name="Loader2" size={15} className="animate-spin" /> Обработка...</>
                : <><Icon name="Wand2" size={15} /> Убрать знак</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
