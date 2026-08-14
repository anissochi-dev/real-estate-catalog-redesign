import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import Icon from '@/components/ui/icon';
import { fetchPublicPartners, PublicPartner } from '@/lib/api';

const PartnerLeadModal = lazy(() => import('@/components/PartnerLeadModal'));

export default function HomePartnersSection() {
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  const [selected, setSelected] = useState<PublicPartner | null>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'start', dragFree: true },
    [Autoplay({ delay: 2800, stopOnInteraction: false, stopOnMouseEnter: true })]
  );

  useEffect(() => {
    fetchPublicPartners().then(setPartners);
  }, []);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (partners.length === 0) return null;

  return (
    <section className="py-10 md:py-14 bg-background border-t border-border">
      <div className="container mx-auto px-4 max-w-6xl">
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

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-4">
            {partners.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                title={p.name}
                className="group relative shrink-0 basis-[47%] sm:basis-[31%] md:basis-[23%] lg:basis-[calc(20%-13px)] bg-white rounded-2xl shadow-sm h-32 md:h-36 flex items-center justify-center p-5 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} className="max-w-full max-h-full object-contain" loading="lazy" />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground truncate">{p.name}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-white font-semibold text-sm px-2 text-center">Сдать объект</span>
                </div>
              </button>
            ))}
          </div>
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