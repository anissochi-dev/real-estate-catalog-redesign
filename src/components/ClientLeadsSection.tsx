import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/icon';

const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';

interface PubLead {
  id: number;
  name: string;
  message: string | null;
  budget: number | null;
  company: string | null;
  created_at: string;
}

interface Props {
  limit?: number;
}

export default function ClientLeadsSection({ limit = 6 }: Props) {
  const [leads, setLeads] = useState<PubLead[]>([]);

  useEffect(() => {
    fetch(`${LISTINGS_URL}?resource=public_leads&limit=${limit}`)
      .then(r => r.json())
      .then(d => setLeads(d.leads || []))
      .catch(() => undefined);
  }, [limit]);

  if (!leads.length) return null;

  return (
    <section className="py-6 bg-white">
      <div className="container mx-auto px-4">
        {/* Шапка секции: подзаголовок + ссылка «Все заявки».
            На мобиле — две строки, ссылка отдельной кнопкой во всю ширину.
            На sm+ — в одну строку справа. */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display font-700 text-base text-foreground flex items-center gap-2 mb-1">
              <Icon name="Users" size={16} className="text-brand-blue" />
              Куплю и сниму недвижимость в Краснодаре — актуальные заявки
            </h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Есть подходящий объект? Предложите его клиенту — заявка попадёт нашему менеджеру.
            </p>
          </div>
          <Link
            to="/leads"
            aria-label="Смотреть все заявки клиентов"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:justify-start px-4 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none border border-brand-blue/30 sm:border-0 bg-brand-blue/5 sm:bg-transparent text-brand-blue font-semibold text-sm sm:hover:gap-3 transition-all duration-200 shrink-0"
          >
            Смотреть все заявки <Icon name="ArrowRight" size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.slice(0, 6).map(l => (
            <div key={l.id} className="bg-muted/30 rounded-2xl p-5 border border-border hover:shadow-md transition flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center font-semibold text-sm">
                    <Icon name="User" size={16} />
                  </div>
                  <h3 className="font-semibold text-sm text-muted-foreground">Заявка #{l.id}</h3>
                </div>
                {l.budget && (
                  <span className="text-xs font-semibold bg-brand-blue/10 text-brand-blue px-2 py-1 rounded-lg">
                    {l.budget.toLocaleString('ru')} ₽
                  </span>
                )}
              </div>
              <div className="text-sm text-foreground flex-1 mb-4 whitespace-pre-wrap break-words">
                {(() => {
                  const text = l.message || 'Без подробностей. Свяжитесь, чтобы уточнить.';
                  return text.length > 300 ? text.slice(0, 300) + '...' : text;
                })()}
              </div>
              <Link
                to={`/leads`}
                className="btn-orange text-white px-4 py-2 rounded-xl text-sm font-semibold font-display inline-flex items-center justify-center gap-2"
              >
                <Icon name="ArrowRight" size={16} />
                Подробнее о заявке
              </Link>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}