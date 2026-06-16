import { useNavigate } from 'react-router-dom';
import { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import SeoHead from '@/components/SeoHead';

interface FavoritesPageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
}

export default function FavoritesPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: FavoritesPageProps) {
  const navigate = useNavigate();

  const goToCatalog = () => {
    if (properties.length > 0) {
      const types = [...new Set(properties.map(p => p.type))];
      navigate(`/catalog?type=${types[0]}`);
    } else {
      navigate('/catalog');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SeoHead title="Избранное — сохранённые объекты" noindex />
      <div className="bg-white border-b border-border py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
              <Icon name="Heart" size={24} className="text-red-500" />
            </div>
            <div>
              <h1 className="font-display font-800 text-2xl text-foreground">Избранное</h1>
              <p className="text-sm text-muted-foreground">{properties.length} сохранённых объектов</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {properties.length === 0 ? (
          <div className="text-center py-24 animate-fade-in">
            <div className="text-7xl mb-6">❤️</div>
            <h2 className="font-display font-700 text-2xl text-foreground mb-3">Нет избранных объектов</h2>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Нажимайте на сердечко в карточке объекта, чтобы сохранить понравившиеся предложения
            </p>
            <button onClick={() => navigate('/catalog')}
              className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">
              Перейти в каталог
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground">
                Сохранено <span className="font-semibold text-foreground">{properties.length}</span> объектов
              </p>
              <button
                className="flex items-center gap-2 text-sm text-brand-orange font-semibold hover:opacity-80 transition-opacity"
                onClick={() => {
                  const ids = properties.map(p => p.id).join(',');
                  const url = `${window.location.origin}/catalog?ids=${ids}`;
                  if (navigator.share) {
                    navigator.share({ title: 'Подборка объектов', url });
                  } else {
                    navigator.clipboard.writeText(url).then(() => alert('Ссылка скопирована'));
                  }
                }}
              >
                <Icon name="Share2" size={16} />
                Поделиться подборкой
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {properties.map((property, i) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  isFavorite={favorites.includes(property.id)}
                  isCompare={compareList.includes(property.id)}
                  onToggleFavorite={onToggleFavorite}
                  onToggleCompare={onToggleCompare}
                  index={i}
                  style={{ animationDelay: `${i * 0.08}s`, opacity: 0 }}
                />
              ))}
            </div>

            {/* AI suggestion banner */}
            <div className="mt-10 bg-gradient-to-r from-brand-blue/5 to-brand-orange/5 border border-brand-blue/15 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-blue flex items-center justify-center flex-shrink-0">
                <Icon name="Sparkles" size={26} className="text-white" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="font-display font-700 text-base text-foreground mb-1">
                  ИИ проанализировал ваши предпочтения
                </div>
                <div className="text-sm text-muted-foreground">
                  На основе избранного мы подготовили персональные рекомендации и рассчитали среднюю доходность
                </div>
              </div>
              <button
                onClick={goToCatalog}
                className="btn-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold font-display flex-shrink-0"
              >
                Смотреть рекомендации
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}