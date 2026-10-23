import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { COLLAGE_MAX } from '@/lib/photoCollage';

interface Props {
  allImages: string[];
  chosen: string[];
  isAuto: boolean;
  isMobile: boolean;
  onChange: (next: string[] | null) => void;
}

type Drag = { from: number; x: number; y: number; moved: boolean; over: number | null };

/** Выбор фото для коллажа: 4 ячейки (замена, удаление, перетаскивание) и лента миниатюр. */
export default function CollagePicker({ allImages, chosen, isAuto, isMobile, onChange }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const ages = useRef(new Map<string, number>());
  const tick = useRef(0);

  const age = (u: string) => ages.current.get(u) ?? -1;
  const stamp = (u: string) => ages.current.set(u, ++tick.current);

  const nextActive = (slot: number, len: number) => (slot + 1 < Math.min(COLLAGE_MAX, len + 1) ? slot + 1 : null);

  const pickImage = (url: string) => {
    const cur = [...chosen];
    const at = cur.indexOf(url);

    if (active !== null) {
      if (at >= 0) {
        if (at !== active && active < cur.length) [cur[at], cur[active]] = [cur[active], cur[at]];
      } else if (active < cur.length) {
        cur[active] = url;
      } else {
        cur.push(url);
      }
      stamp(url);
      onChange(cur);
      setActive(nextActive(active, cur.length));
      return;
    }

    if (at >= 0) {
      if (cur.length > 1) onChange(cur.filter(u => u !== url));
      return;
    }
    if (cur.length < COLLAGE_MAX) {
      cur.push(url);
    } else {
      let oldest = 0;
      cur.forEach((u, i) => { if (age(u) < age(cur[oldest])) oldest = i; });
      cur[oldest] = url;
    }
    stamp(url);
    onChange(cur);
  };

  const removeSlot = (i: number) => {
    if (chosen.length <= 1) return;
    onChange(chosen.filter((_, k) => k !== i));
    setActive(null);
  };

  const startOver = () => {
    onChange([]);
    setActive(0);
  };

  const swap = (a: number, b: number) => {
    const cur = [...chosen];
    [cur[a], cur[b]] = [cur[b], cur[a]];
    onChange(cur);
  };

  const slotAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null;
    return el ? Number(el.dataset.slot) : null;
  };

  const onDown = (i: number) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-remove]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: i, x: e.clientX, y: e.clientY, moved: false, over: null });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8;
    const over = moved ? slotAt(e.clientX, e.clientY) : null;
    if (moved !== drag.moved || over !== drag.over) setDrag({ ...drag, moved, over });
  };

  const onUp = (i: number) => (e: React.PointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.moved) {
      const to = slotAt(e.clientX, e.clientY);
      if (to !== null && to !== d.from && to < chosen.length && d.from < chosen.length) swap(d.from, to);
      return;
    }
    setActive(active === i ? null : i);
  };

  const slotsCount = Math.min(COLLAGE_MAX, allImages.length);
  const slots = Array.from({ length: slotsCount }, (_, i) => chosen[i] ?? null);

  const hint = active !== null
    ? `Выберите фото снизу для места ${active + 1}`
    : 'Нажмите на место, затем на фото снизу. Перетащите, чтобы поменять местами.';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Фото в коллаже: {chosen.length} из {COLLAGE_MAX}</span>
        <div className="flex items-center gap-3 text-xs sm:text-[11px] font-semibold text-brand-blue">
          <button type="button" onClick={startOver} className="hover:underline py-1">Выбрать заново</button>
          {!isAuto && (
            <button type="button" onClick={() => { onChange(null); setActive(null); }} className="hover:underline py-1">Сбросить</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 select-none md:w-3/5">
        {slots.map((url, i) => {
          const isActive = active === i;
          const isOver = drag?.moved && drag.over === i && drag.from !== i;
          const isDragged = drag?.moved && drag.from === i;
          return (
            <div
              key={i}
              data-slot={i}
              onPointerDown={onDown(i)}
              onPointerMove={onMove}
              onPointerUp={onUp(i)}
              onPointerCancel={() => setDrag(null)}
              className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer touch-none transition ${
                isActive ? 'border-brand-blue ring-2 ring-brand-blue/30' : isOver ? 'border-emerald-500' : url ? 'border-border' : 'border-dashed border-muted-foreground/40'
              } ${isDragged ? 'opacity-50' : ''}`}
            >
              {url ? (
                <img src={url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted/40 text-muted-foreground">
                  <Icon name="Plus" size={18} />
                </div>
              )}
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center pointer-events-none ${
                url ? 'bg-brand-blue text-white' : 'bg-white text-muted-foreground'}`}>
                {i + 1}
              </span>
              {url && chosen.length > 1 && (
                <button type="button" data-remove onClick={() => removeSlot(i)} title="Убрать"
                  className="absolute top-1 right-1 w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <Icon name="X" size={isMobile ? 14 : 11} />
                </button>
              )}
              {isActive && (
                <span className="absolute bottom-0 inset-x-0 bg-brand-blue text-white text-[10px] font-semibold text-center py-0.5 pointer-events-none">
                  Замена
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className={`text-xs sm:text-[11px] ${active !== null ? 'text-brand-blue font-semibold' : 'text-muted-foreground'}`}>{hint}</div>

      <div className="flex gap-2 sm:gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {allImages.map(url => {
          const idx = chosen.indexOf(url);
          const on = idx >= 0;
          return (
            <button key={url} type="button" onClick={() => pickImage(url)}
              className={`relative shrink-0 snap-start block w-[72px] h-[72px] sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 transition ${
                on ? 'border-brand-blue' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
              {on && (
                <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
