import { useEffect, useState } from 'react';

const SEO_CONTENT_URL = 'https://functions.poehali.dev/4f6d05ce-e38c-4e10-8a8b-f282e1ed2ddd';

interface MarketIndexSeoBlockProps {
  city?: string;
}

export default function MarketIndexSeoBlock({ city = 'Краснодар' }: MarketIndexSeoBlockProps) {
  const [aiText, setAiText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${SEO_CONTENT_URL}?market=true&city=${encodeURIComponent(city)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.text) setAiText(d.text); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [city]);

  return (
    <div className="mt-8 p-6 bg-white rounded-2xl border border-border">
      <h2 className="font-display font-700 text-lg mb-3">
        Цены на коммерческую недвижимость в {city}е — актуальная аналитика
      </h2>

      {loading && !aiText ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-3.5 bg-muted rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      ) : aiText ? (
        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {aiText}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Индекс цен коммерческой недвижимости {city}а помогает арендаторам, покупателям и инвесторам
          ориентироваться в актуальной стоимости офисов, торговых помещений, складов и другой
          коммерческой недвижимости. Данные обновляются на основе реальных рыночных предложений.
        </p>
      )}
    </div>
  );
}
