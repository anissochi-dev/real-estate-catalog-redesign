import { useNavigate } from 'react-router-dom';
import { catalogCategoryUrl } from '@/lib/categories';
import { CATEGORY_META, CategoryMetaItem } from './categoryMeta';
import ExpandableText from '@/components/ExpandableText';

interface CategorySeoBlockProps {
  meta: CategoryMetaItem;
  type?: string;
  city: string;
  companySinceYear?: number;
  aiSeoText: string;
  aiSeoLoading: boolean;
}

export default function CategorySeoBlock({
  meta, type, city, companySinceYear, aiSeoText, aiSeoLoading,
}: CategorySeoBlockProps) {
  const navigate = useNavigate();

  return (
    <div className="mt-12 py-10 px-6 bg-white rounded-2xl border border-border">
      <h2 className="font-display font-700 text-lg mb-1">{meta.h2}</h2>
      <h5 className="text-sm text-brand-blue font-medium mb-3">{meta.h5}</h5>

      {/* AI-текст или скелетон или статический фолбэк */}
      {aiSeoLoading && !aiSeoText ? (
        <div className="space-y-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-3.5 bg-muted rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <ExpandableText>
            {aiSeoText ? (
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {aiSeoText}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {meta.description} Наша компания специализируется на подборе коммерческой недвижимости
                в {city}е с {companySinceYear || 2007} года. Мы помогаем как покупателям,
                так и арендаторам найти оптимальный объект с учётом бюджета, требований к площади и расположению.
              </p>
            )}
          </ExpandableText>
        </div>
      )}

      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Другие категории</h4>
      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_META)
          .filter(([k]) => k !== type)
          .map(([k, v]) => (
            <button
              key={k}
              onClick={() => navigate(catalogCategoryUrl(k))}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-brand-blue hover:text-brand-blue transition-colors"
            >
              {v.labelRu}
            </button>
          ))}
      </div>
    </div>
  );
}