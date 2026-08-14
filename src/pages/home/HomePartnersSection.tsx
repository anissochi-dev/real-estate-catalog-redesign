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

  useEffect(() => {
    if (partners.length > 0) emblaApi?.reInit();
  }, [partners, emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Карточки логотипов имеют переменную ширину (подстраивается под пропорции лого),
  // а сами логотипы грузятся асинхронно. Embla считает точки прокрутки один раз при первой
  // отрисовке — пока картинки не подгрузились, ширина карточек ещё не финальная, из-за чего
  // на границе цикла (loop) карусель "скачет". Пересчитываем раскладку, когда лого подгрузились.
  const handleLogoLoad = useCallback(() => emblaApi?.reInit(), [emblaApi]);

  if (partners.length === 0) return null;

  // embla loop корректно анимирует переход последний→первый слайд (в т.ч. при ручном
  // перетаскивании) только если общая ширина слайдов минимум в 2-3 раза больше видимой
  // области. При малом числе партнёров повторяем список нужное число раз, чтобы точно
  // хватило ширины (на широких экранах видно до 5 карточек — берём запас x3)
  const minSlides = 18;
  const repeat = Math.max(1, Math.ceil(minSlides / partners.length));
  const slides = repeat > 1 ? Array.from({ length: repeat }, () => partners).flat() : partners;

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
                  <img src={p.logo_url} alt={p.name} className="h-full w-auto max-w-none object-contain py-5" loading="lazy" onLoad={handleLogoLoad} />
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