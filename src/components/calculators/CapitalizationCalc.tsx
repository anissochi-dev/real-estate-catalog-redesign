import { useState } from 'react';
import { NumberField, ResultRow, fmtRub, fmtPct } from './utils';

interface Props {
  yearProfit: number;
}

// Метод капитализации прибыли
export default function CapitalizationCalc({ yearProfit }: Props) {
  const [profit, setProfit] = useState(yearProfit);
  const [capRate, setCapRate] = useState(15);
  const [riskFree, setRiskFree] = useState(8);
  const [riskPremium, setRiskPremium] = useState(7);

  const valueByCap = capRate > 0 ? (profit / capRate) * 100 : 0;
  const totalRate = riskFree + riskPremium;
  const valueByRisk = totalRate > 0 ? (profit / totalRate) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        <NumberField label="Годовая прибыль, ₽" value={profit} onChange={setProfit} step={100000} />
        <NumberField label="Ставка капитализации, %" value={capRate} onChange={setCapRate} step={0.5} />
        <NumberField label="Безрисковая ставка, %" value={riskFree} onChange={setRiskFree} step={0.5} hint="ОФЗ / ключевая ЦБ" />
        <NumberField label="Премия за риск, %" value={riskPremium} onChange={setRiskPremium} step={0.5} />
      </div>
      <div className="bg-muted/40 rounded-xl p-3 space-y-1">
        <ResultRow label="Стоимость по ставке капитализации" value={fmtRub(valueByCap)} color="blue" />
        <ResultRow label="Стоимость по сумме рисков" value={fmtRub(valueByRisk)} color="blue" hint={`Ставка: ${fmtPct(totalRate)}`} />
        <ResultRow label="Среднее значение" value={fmtRub((valueByCap + valueByRisk) / 2)} color="green" />
      </div>
    </div>
  );
}
