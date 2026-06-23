import Icon from '@/components/ui/icon';

interface PropertyFaqSectionProps {
  faq: { question: string; answer: string }[];
  faqLoading: boolean;
}

export default function PropertyFaqSection({ faq, faqLoading }: PropertyFaqSectionProps) {
  return (
    <>
      {/* FAQ — часто задаваемые вопросы */}
      {faqLoading && (
        <div className="mt-8 border-t border-border pt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-brand-blue/30 border-t-brand-blue animate-spin" />
          Генерируем FAQ для этого объекта…
        </div>
      )}
      {faq.length > 0 && (
        <section className="mt-8 border-t border-border pt-8" aria-label="Часто задаваемые вопросы">
          <h2 className="font-display font-700 text-xl text-foreground mb-5 flex items-center justify-center gap-2">
            <Icon name="HelpCircle" size={20} className="text-brand-blue" />
            Часто задаваемые вопросы
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {faq.slice(0, 6).map((faqItem, i) => (
              <details key={i} className="group border border-border rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3.5 cursor-pointer font-semibold text-sm select-none list-none hover:bg-muted/50 transition-colors">
                  <span>{faqItem.question}</span>
                  <Icon name="ChevronDown" size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180 ml-3" />
                </summary>
                <div className="px-4 pb-4 pt-1 text-sm text-foreground/80 leading-relaxed border-t border-border">
                  {faqItem.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
