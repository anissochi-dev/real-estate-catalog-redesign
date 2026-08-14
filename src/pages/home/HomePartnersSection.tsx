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

  // embla loop корректно анимирует переход последний→первый слайд только если слайдов
  // достаточно много. При малом числе партнёров дублируем список для плавного зацикливания
  // (реальные данные/клики не меняются — просто карусель "видит" больше карточек)
  const slides = partners.length < 6 ? [...partners, ...partners, ...partners] : partners;

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
            {slides.map((p, i) => (
              <button
                key={`${p.id}-${i}`}
                onClick={() => setSelected(p)}
                title={p.name}
                className="group relative shrink-0 bg-white rounded-2xl shadow-sm h-32 md:h-36 flex items-center justify-center px-6 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} className="h-full w-auto max-w-none object-contain py-5" loading="lazy" />
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground truncate">{p.name}</span>
                )}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center bg-white py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-brand-gold font-bold text-lg md:text-xl leading-tight text-center">Сдать объект?</span>
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