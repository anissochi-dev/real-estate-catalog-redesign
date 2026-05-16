import { useState } from 'react';
import { NumberField, ResultRow, fmtRub, fmtPct } from './utils';

interface Props {
  yearCashFlow: number;
}

// Метод дисконтированных денежных потоков
export default function DcfCalc({ yearCashFlow }: Props) {
  const [cf, setCf] = useState(yearCashFlow);
  const [growth, setGrowth] = useState(5);
  const [discount, setDiscount] = useState(15);
  const [years, setYears] = useState(5);
  const [terminal, setTerminal] = useState(3);

  let pv = 0;
  let lastCf = cf;
  for (let t = 1; t <= years; t++) {
    lastCf = cf * Math.pow(1 + growth / 100, t);
    pv += lastCf / Math.pow(1 + discount / 100, t);
  }
  // Терминальная стоимость (модель Гордона)
  const termCf = lastCf * (1 + terminal / 100);
  const termValue = discount > terminal ? termCf / ((discount - terminal) / 100) : 0;
  const termPv = termValue / Math.pow(1 + discount / 100, years);
  const total = pv + termPv;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberField label="Денежный поток / год, ₽" value={cf} onChange={setCf} step={100000} />
        <NumberField label="Рост потока, %" value={growth} onChange={setGrowth} step={0.5} />
        <NumberField label="Ставка дисконт., %" value={discount} onChange={setDiscount} step={0.5} hint="Стоимость капитала" />
        <NumberField label="Период, лет" value={years} onChange={setYears} step={1} />
        <NumberField label="Терминал. рост, %" value={terminal} onChange={setTerminal} step={0.5} />
      </div>
      <div className="bg-muted/40 rounded-xl p-3 space-y-1">
        <ResultRow label="PV прогнозных потоков" value={fmtRub(pv)} color="blue" />
        <ResultRow label="PV терминальной стоимости" value={fmtRub(termPv)} color="blue" />
        <ResultRow label="Справедливая стоимость (DCF)" value={fmtRub(total)} color="green" />
        <ResultRow label="Дисконт-фактор за период" value={fmtPct(((1 - 1 / Math.pow(1 + discount / 100, years)) * 100))} color="orange" />
      </div>
    </div>
  );
}
