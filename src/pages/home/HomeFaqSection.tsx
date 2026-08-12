import Icon from '@/components/ui/icon';

interface FaqItem {
  question: string;
  answer: string;
}

interface HomeFaqSectionProps {
  faqItems: FaqItem[];
}

export default function HomeFaqSection({ faqItems }: HomeFaqSectionProps) {
  return (
    <section className="py-12 md:py-16 bg-white" aria-labelledby="faq-title">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 id="faq-title" className="font-display font-800 text-2xl md:text-3xl text-foreground mb-6 md:mb-8 text-center">
          Частые вопросы
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-x-5 md:gap-y-3 md:items-start">
          {faqItems.map((f, i) => (
            <details key={i} className="group bg-muted/30 rounded-xl border border-border px-4 py-3.5">
              <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-sm text-foreground">
                {f.question}
                <Icon name="ChevronDown" size={16} className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0 ml-2" />
              </summary>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export type { FaqItem };