import { useState, useMemo } from 'react';
import Icon from '@/components/ui/icon';
import CashflowCalc from './CashflowCalc';
import DcfCalc from './DcfCalc';
import MultiplesCalc from './MultiplesCalc';
import CostApproachCalc from './CostApproachCalc';
import CapitalizationCalc from './CapitalizationCalc';
import BreakEvenCalc from './BreakEvenCalc';
import UnitEconomicsCalc from './UnitEconomicsCalc';
import MarginCalc from './MarginCalc';
import NpvIrrCalc from './NpvIrrCalc';
import TaxCalc from './TaxCalc';
import MortgageCalc from './MortgageCalc';

interface Props {
  price: number;
  area: number;
  deal: string;
  type: string;
  payback?: number;
  profit?: number;
  pricePerM2?: number;
}

type CalcKey =
  | 'cashflow' | 'dcf' | 'mult' | 'cost' | 'cap'
  | 'be' | 'unit' | 'margin' | 'npv' | 'tax' | 'mortgage';

const TABS: { key: CalcKey; label: string; icon: string; group: string }[] = [
  { key: 'cashflow', label: 'Прибыль / ROI', icon: 'TrendingUp', group: 'Финансы' },
  { key: 'mortgage', label: 'Ипотека', icon: 'Landmark', group: 'Финансы' },
  { key: 'npv', label: 'NPV / IRR / PP', icon: 'LineChart', group: 'Инвестиции' },
  { key: 'dcf', label: 'DCF', icon: 'TrendingDown', group: 'Оценка' },
  { key: 'mult', label: 'Мультипликаторы', icon: 'Layers', group: 'Оценка' },
  { key: 'cap', label: 'Капитализация', icon: 'Coins', group: 'Оценка' },
  { key: 'cost', label: 'Балансовая стоимость', icon: 'Wallet', group: 'Оценка' },
  { key: 'be', label: 'Точка безубыточности', icon: 'Target', group: 'Бизнес' },
  { key: 'unit', label: 'Юнит-экономика', icon: 'Users', group: 'Бизнес' },
  { key: 'margin', label: 'Маржа / наценка', icon: 'Percent', group: 'Бизнес' },
  { key: 'tax', label: 'Налоги', icon: 'Calculator', group: 'Бизнес' },
];

export default function PropertyCalculators({
  price, area, deal, type, payback, profit, pricePerM2,
}: Props) {
  const [active, setActive] = useState<CalcKey>('cashflow');
  const [open, setOpen] = useState(true);

  // Автозаполнение известных полей из карточки объекта
  const auto = useMemo(() => {
    // Месячный доход (для бизнеса/ГАБ — известный profit, для аренды — это сама цена)
    let monthlyIncome = 0;
    if (deal === 'rent') monthlyIncome = price;
    else if (deal === 'business' && profit) monthlyIncome = profit * 1.4; // прибыль ~70% выручки
    else if (payback && payback > 0) monthlyIncome = price / payback;

    // Месячные расходы
    let monthlyExpenses = 0;
    if (deal === 'business' && profit) monthlyExpenses = monthlyIncome - profit;
    else if (deal === 'rent') monthlyExpenses = price * 0.15; // налоги/обслуживание для арендодателя
    else monthlyExpenses = monthlyIncome * 0.3;

    // Годовая прибыль
    const yearProfit = profit ? profit * 12 : (monthlyIncome - monthlyExpenses) * 12;
    const yearRevenue = monthlyIncome * 12;
    const yearCashFlow = yearProfit;

    return {
      monthlyIncome: Math.max(0, Math.round(monthlyIncome)),
      monthlyExpenses: Math.max(0, Math.round(monthlyExpenses)),
      yearProfit: Math.round(yearProfit),
      yearRevenue: Math.round(yearRevenue),
      yearCashFlow: Math.round(yearCashFlow),
      invest: deal === 'rent' ? price * 12 * 10 : price, // для аренды инвестиции = 10 лет аренды
    };
  }, [price, deal, payback, profit]);

  const filteredTabs = useMemo(() => {
    // Для аренды не показываем мультипликаторы/DCF/балансовую — нерелевантно
    if (deal === 'rent') {
      return TABS.filter(t => ['cashflow', 'be', 'margin', 'tax', 'mortgage'].includes(t.key));
    }
    // Для готового бизнеса убираем ипотеку, показываем всё остальное
    if (deal === 'business') {
      return TABS.filter(t => t.key !== 'mortgage');
    }
    return TABS;
  }, [deal]);

  const renderCalc = () => {
    switch (active) {
      case 'cashflow':
        return <CashflowCalc price={auto.invest} monthlyIncome={auto.monthlyIncome} monthlyExpenses={auto.monthlyExpenses} />;
      case 'dcf':
        return <DcfCalc yearCashFlow={auto.yearCashFlow} />;
      case 'mult':
        return <MultiplesCalc revenueYear={auto.yearRevenue} ebitdaYear={auto.yearProfit} />;
      case 'cost':
        return <CostApproachCalc />;
      case 'cap':
        return <CapitalizationCalc yearProfit={auto.yearProfit} />;
      case 'be':
        return <BreakEvenCalc />;
      case 'unit':
        return <UnitEconomicsCalc />;
      case 'margin':
        return <MarginCalc />;
      case 'npv':
        return <NpvIrrCalc invest={auto.invest} yearCashFlow={auto.yearCashFlow} />;
      case 'tax':
        return <TaxCalc />;
      case 'mortgage':
        return <MortgageCalc price={price} />;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-blue to-blue-700 flex items-center justify-center flex-shrink-0">
            <Icon name="Calculator" size={20} className="text-white" />
          </div>
          <div className="text-left">
            <div className="font-display font-800 text-lg">Финансовые калькуляторы</div>
            <div className="text-xs text-muted-foreground">
              {filteredTabs.length} инструментов · поля автозаполнены из карточки
            </div>
          </div>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={20} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Tabs */}
          <div className="flex gap-1 p-2 bg-muted/30 overflow-x-auto border-b border-border">
            {filteredTabs.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                  active === t.key
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-foreground hover:bg-white'
                }`}
              >
                <Icon name={t.icon} size={12} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-5">
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-900 flex items-start gap-2">
              <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                Поля предзаполнены данными объекта: цена {price.toLocaleString('ru')} ₽, площадь {area} м²
                {pricePerM2 ? `, ${pricePerM2.toLocaleString('ru')} ₽/м²` : ''}
                {payback ? `, окупаемость ${payback} мес` : ''}
                {profit ? `, прибыль ${profit.toLocaleString('ru')} ₽/мес` : ''}.
                Меняйте любые значения — расчёт обновится мгновенно.
              </div>
            </div>
            <div>
              {renderCalc()}
            </div>


          </div>
        </div>
      )}
    </div>
  );
}