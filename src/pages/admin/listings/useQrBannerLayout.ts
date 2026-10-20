import { useEffect, useRef, useState } from 'react';
import {
  BannerElement, ElementId, Pos, ManualSizes,
  layoutElements, sizeFromCm,
  DEAL_WEIGHT, PHONE_WEIGHT, LABEL_WEIGHT,
} from './QrBannerTypes';

interface Args {
  bannerW: number;
  bannerH: number;
  dealText: string;
  phoneText: string;
  selected: ElementId | null;
  setSelected: (id: ElementId | null) => void;
}

export function useQrBannerLayout({ bannerW, bannerH, dealText, phoneText, selected, setSelected }: Args) {
  const [elements, setElements] = useState<BannerElement[]>([]);

  // ── элементы: авто-раскладка в долях от размера баннера ──────────────────
  const [manual, setManual] = useState<ManualSizes>({});
  const [fontsReady, setFontsReady] = useState(0);
  const movedRef = useRef<Set<ElementId>>(new Set());
  const dimsRef = useRef<{ w: number; h: number } | null>(null);
  const pendingTplRef = useRef<{ w: number; h: number; els: BannerElement[] } | null>(null);

  useEffect(() => {
    if (!document.fonts) return;
    Promise.all([
      document.fonts.load(`${DEAL_WEIGHT} 100px Montserrat`),
      document.fonts.load(`${PHONE_WEIGHT} 100px Montserrat`),
      document.fonts.load(`${LABEL_WEIGHT} 100px Montserrat`),
    ]).then(() => setFontsReady(v => v + 1)).catch(() => {});
  }, []);

  useEffect(() => {
    const prevDims = dimsRef.current;
    const sizeChanged = !prevDims || prevDims.w !== bannerW || prevDims.h !== bannerH;
    dimsRef.current = { w: bannerW, h: bannerH };
    if (sizeChanged) movedRef.current = new Set();
    const moved = movedRef.current;
    const tpl = pendingTplRef.current;
    if (tpl && tpl.w === bannerW && tpl.h === bannerH) {
      pendingTplRef.current = null;
      setElements(prev => {
        const next = layoutElements(bannerW, bannerH, { dealText, phoneText }, manual, prev, prevDims ?? undefined)
          .filter(n => !tpl.els.some(t => t.id === n.id) || n.id === 'deal' || n.id === 'phone' || n.id === 'qr');
        const merged = next.map(n => {
          const t = tpl.els.find(e => e.id === n.id);
          return t ? { ...n, pos: t.pos } : n;
        });
        const extras = tpl.els.filter(t => !merged.some(m => m.id === t.id));
        tpl.els.forEach(t => moved.add(t.id));
        return [...merged, ...extras];
      });
      setSelected(null);
      return;
    }
    setElements(prev => {
      const next = layoutElements(bannerW, bannerH, { dealText, phoneText }, manual, prev, prevDims ?? undefined);
      if (sizeChanged) return next;
      return next.map(n => {
        if (!moved.has(n.id)) return n;
        const p = prev.find(e => e.id === n.id);
        return p ? { ...n, pos: p.pos } : n;
      });
    });
    if (sizeChanged) setSelected(null);
  }, [bannerW, bannerH, dealText, phoneText, manual, fontsReady]);

  const resetPositions = () => {
    movedRef.current = new Set();
    setManual({});
    setElements(prev => layoutElements(bannerW, bannerH, { dealText, phoneText }, {}, prev));
    setSelected(null);
  };

  const addImageElement = (id: 'logo' | 'photo') => {
    const m = Math.round(Math.min(bannerW, bannerH) * 0.07);
    const size = Math.round(bannerH * (id === 'logo' ? 0.28 : 0.4));
    const pos = id === 'logo' ? { x: m, y: m } : { x: m, y: bannerH - size - m };
    movedRef.current.add(id);
    setManual(prev => { const n = { ...prev }; delete n[id]; return n; });
    setElements(prev => [...prev.filter(e => e.id !== id), { id, pos, imgSize: size }]);
  };
  const removeImageElement = (id: 'logo' | 'photo') => {
    setElements(prev => prev.filter(e => e.id !== id));
    setManual(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (selected === id) setSelected(null);
  };

  // ── редактор ──────────────────────────────────────────────────────────────
  const updatePos = (id: ElementId, pos: Pos) => {
    movedRef.current.add(id);
    setElements(prev => prev.map(e => e.id === id ? { ...e, pos } : e));
  };

  const setSelectedCm = (cm: number) => {
    if (!selected) return;
    const maxSide = Math.max(bannerW, bannerH) * 2;
    const v = Math.max(4, Math.min(maxSide, sizeFromCm(selected, cm)));
    setManual(prev => ({ ...prev, [selected]: v }));
  };
  const setSelectedAuto = () => {
    if (!selected) return;
    setManual(prev => { const n = { ...prev }; delete n[selected]; return n; });
  };

  return {
    elements, manual, setManual, pendingTplRef,
    resetPositions, addImageElement, removeImageElement,
    updatePos, setSelectedCm, setSelectedAuto,
  };
}

export default useQrBannerLayout;
