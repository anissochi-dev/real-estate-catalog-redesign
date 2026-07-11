import { lazy, Suspense, useState } from 'react';
import Icon from '@/components/ui/icon';
import { fmtMoneyFull } from './modelMath';
import { Benchmarks, ModelResult } from './types';

const CashFlowChart = lazy(() => import('./CashFlowChart'));

interface Props {
  liveResult: ModelResult;
  benchmarks: Benchmarks;
}

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold pt-1 border-t border-border/60' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? 'text-red-600' : ''}>{value}</span>
    </div>
  );
}

export default function CashFlowSection({ liveResult, benchmarks }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-3">
      <Suspense fallback={<div className="h-[200px] bg-muted/30 rounded-xl animate-pulse" />}>
        <CashFlowChart yearly={liveResult.yearly} />
      </Suspense>

      <button
        onClick={() => setShowAdvanced(s => !s)}
        className="w-full text-xs text-brand-blue hover:underline flex items-center justify-center gap-1"
      >
        <Icon name={showAdvanced ? 'ChevronUp' : 'ChevronDown'} size={12} />
        {showAdvanced ? 'Скрыть детали' : 'Показать раскладку доходов'}
      </button>

      {showAdvanced && (
        <div className="bg-muted/30 rounded-xl p-3 space-y-1.5 text-xs">
          <div className="font-semibold text-sm mb-1">Раскладка 1-го года</div>
          <Row label="Доход от аренды (GPI)" value={fmtMoneyFull(liveResult.gpi_year1)} />
          {!benchmarks.is_gab && (
            <Row label="Эффективный доход (EGI, с вакантностью)" value={fmtMoneyFull(liveResult.egi_year1)} />
          )}
          {benchmarks.is_gab ? (
            <>
              <Row label="− УСН 6% от дохода" value={fmtMoneyFull(-(benchmarks.usn_annual ?? 0))} negative />
              <Row label="− Налог на имущество" value={fmtMoneyFull(-(benchmarks.property_tax_annual ?? 0))} negative />
              <Row label="OPEX (расходы арендатора)" value="0 ₽" />
            </>
          ) : (
            <>
              <Row label="− Операционные расходы" value={fmtMoneyFull(-liveResult.opex_year1)} negative />
              <Row label="− Налог на имущество" value={fmtMoneyFull(-liveResult.tax_year1)} negative />
            </>
          )}
          <Row label="= NOI (чистый доход)" value={fmtMoneyFull(liveResult.noi_year1)} bold />
          {liveResult.loan_amount > 0 && (
            <>
              <Row label="Сумма кредита" value={fmtMoneyFull(liveResult.loan_amount)} />
              <Row label="Обслуживание долга (год)" value={fmtMoneyFull(-liveResult.debt_service_annual)} negative />
            </>
          )}
          {liveResult.terminal_value > 0 && (
            <>
              <div className="border-t border-border/40 mt-2 pt-2 font-semibold text-sm">Стоимость выхода (год 10)</div>
              <Row label="Terminal Value (продажа актива)" value={fmtMoneyFull(liveResult.terminal_value)} />
              <Row label="PV Terminal Value (дисконт.)" value={fmtMoneyFull(liveResult.pv_terminal)} />
              <Row label="NPV операционный (без TV)" value={fmtMoneyFull(liveResult.npv_operations)} />
              <Row label="= NPV полный (с выходом)" value={fmtMoneyFull(liveResult.npv_10y)} bold />
            </>
          )}
        </div>
      )}
    </div>
  );
}
