import Icon from '@/components/ui/icon';
import SchemaOrg from '@/components/SchemaOrg';

const FAQ_ITEMS = [
  {
    q: 'Как разместить заявку на аренду коммерческой недвижимости?',
    a: 'Нажмите кнопку «Разместить объект» или обратитесь к нашим менеджерам. Заявка будет опубликована в течение одного рабочего дня.',
    short_q: 'Как разместить заявку на аренду?',
    short_a: 'Нажмите «Разместить объект» или обратитесь к менеджерам. Заявка публикуется в течение одного рабочего дня.',
  },
  {
    q: 'Какую коммерческую недвижимость ищут в Краснодаре?',
    a: 'Арендаторы ищут офисы, торговые площади, склады, рестораны, гостиницы и производственные помещения. Федеральные сети рассматривают объекты от 100 м² в проходимых локациях.',
    short_q: 'Какую недвижимость ищут в Краснодаре?',
    short_a: 'Офисы, торговые площади, склады, рестораны, гостиницы и производственные помещения. Федеральные сети рассматривают объекты от 100 м² в проходимых локациях.',
  },
  {
    q: 'Как связаться с автором заявки?',
    a: 'Нажмите кнопку «Связаться» под заявкой, оставьте свои контактные данные — менеджер передаст их заявителю и организует переговоры.',
    short_q: 'Как связаться с автором заявки?',
    short_a: 'Нажмите «Связаться» под заявкой, оставьте контакты — менеджер организует переговоры.',
  },
  {
    q: 'Бесплатно ли размещение заявки?',
    a: 'Да, размещение заявки на аренду или покупку коммерческой недвижимости на нашем сайте бесплатно для арендаторов и покупателей.',
    short_q: 'Размещение заявки платное?',
    short_a: 'Нет, размещение заявки для арендаторов и покупателей полностью бесплатно.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function LeadsFaq() {
  return (
    <>
      <SchemaOrg schema={faqSchema} id="leads-faq" />
      <div className="container mx-auto px-4 pb-10 max-w-3xl">
        <h2 className="font-display font-700 text-xl text-foreground mb-4 mt-2">Частые вопросы</h2>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
          {FAQ_ITEMS.map(({ short_q, short_a }) => (
            <details key={short_q} className="group bg-white px-5 py-4 cursor-pointer select-none">
              <summary className="font-semibold text-[15px] text-foreground list-none flex items-center justify-between gap-3">
                {short_q}
                <Icon name="ChevronDown" size={16} className="shrink-0 text-muted-foreground group-open:rotate-180 transition-transform" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{short_a}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
