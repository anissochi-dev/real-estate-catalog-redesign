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
    <section className="py-4 bg-white" aria-labelledby="faq-title">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 id="faq-title" className="font-display font-800 text-lg sm:text-xl text-foreground mb-3 text-center">
          Частые вопросы
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-x-4 md:gap-y-2 md:items-start">
          {faqItems.map((f, i) => (
            <details key={i} className="group bg-muted/30 rounded-lg border border-border px-3 py-2">
              <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-[13px] text-foreground">
                {f.question}
                <Icon name="ChevronDown" size={15} className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0 ml-2" />
              </summary>
              <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export type { FaqItem };
