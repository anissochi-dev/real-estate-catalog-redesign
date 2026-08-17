import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import Icon from '@/components/ui/icon';
import { fetchPublicPartners, PublicPartner } from '@/lib/api';

const PartnerLeadModal = lazy(() => import('@/components/PartnerLeadModal'));

const AUTOPLAY_DELAY = 2800;

export default function HomePartnersSection() {
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  const [selected, setSelected] = useState<PublicPartner | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchPublicPartners().then(setPartners);
  }, []);

  // Скроллим на ширину одной карточки нативным плавным скроллом браузера —
  // никакой ручной анимации через JS, поэтому движение всегда стабильное и без рывков.
  const scrollByCard = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-card]');
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.8;
    const maxScroll = el.scrollWidth - el.clientWidth;
    let next = el.scrollLeft + dir * step;
    if (next >= maxScroll - 4) next = 0;
    if (next < 0) next = maxScroll;
    el.scrollTo({ left: next, behavior: 'smooth' });
  }, []);

  const stopAutoplay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    if (partners.length <= 1) return;
    timerRef.current = setInterval(() => scrollByCard(1), AUTOPLAY_DELAY);
  }, [partners.length, scrollByCard, stopAutoplay]);

  useEffect(() => {
    startAutoplay();
    return stopAutoplay;
  }, [startAutoplay, stopAutoplay]);

  const scrollPrev = useCallback(() => {
    scrollByCard(-1);
    startAutoplay();
  }, [scrollByCard, startAutoplay]);

  const scrollNext = useCallback(() => {
    scrollByCard(1);
    startAutoplay();
  }, [scrollByCard, startAutoplay]);

  if (partners.length === 0) return null;

  return (
    <section className="py-10 md:py-14 bg-background border-t border-border">
      <div className="container mx-auto px-4">
        <div className="text-center mb-6 md:mb-8">
          <h2 className="font-display font-800 text-2xl md:text-3xl text-foreground">Наши партнёры</h2>
        </div>

        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            onClick={scrollPrev}
            aria-label="Предыдущие"
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition"
          >
            <Icon name="ChevronLeft" size={18} />
          </button>
          <button
            onClick={scrollNext}
            aria-label="Следующие"
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition"
          >
            <Icon name="ChevronRight" size={18} />
          </button>
        </div>

        <div
          ref={trackRef}
          onMouseEnter={stopAutoplay}
          onMouseLeave={startAutoplay}
          className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory"
        >
          {partners.map(p => (
            <div
              key={p.id}
              data-card
              className="snap-start shrink-0 w-[calc(50%-8px)] sm:w-[calc(33.333%-11px)] md:w-[calc(25%-12px)] lg:w-[calc(20%-13px)]"
            >
              <button
                onClick={() => setSelected(p)}
                title={p.name}
                className="group relative w-full bg-white rounded-2xl shadow-sm h-32 md:h-36 flex items-center justify-center px-6 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} className="max-h-full max-w-full object-contain py-5" loading="lazy" />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground truncate">{p.name}</span>
                )}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-white py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-brand-gold font-bold text-lg md:text-xl leading-tight text-center">Сдать объект?</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <Suspense fallback={null}>
          <PartnerLeadModal partner={selected} onClose={() => setSelected(null)} />
        </Suspense>
      )}
    </section>
  );
}
