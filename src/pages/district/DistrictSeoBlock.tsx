interface DistrictSeoBlockProps {
  displayName: string;
  isOkrug: boolean;
  city: string;
  aiText: string;
  aiLoading: boolean;
  description?: string;
}

export default function DistrictSeoBlock({
  displayName, isOkrug, city, aiText, aiLoading, description,
}: DistrictSeoBlockProps) {
  return (
    <div className="mt-12 p-6 bg-white rounded-2xl border border-border">
      <h2 className="font-display font-700 text-lg mb-3">
        О коммерческой недвижимости: {isOkrug ? displayName : `район ${displayName}`}
      </h2>
      {aiLoading && !aiText && !description ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-3.5 bg-muted rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {aiText || description || `Актуальные объекты коммерческой недвижимости в ${isOkrug ? displayName : `районе ${displayName}`}, ${city} — офисы, торговые площади, склады, производственные помещения и готовый бизнес.`}
        </p>
      )}
    </div>
  );
}
