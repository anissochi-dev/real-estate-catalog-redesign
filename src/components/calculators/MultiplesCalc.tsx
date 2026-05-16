import { useState } from 'react';
import { NumberField, ResultRow, fmtRub } from './utils';

interface Props {
  revenueYear: number;
  ebitdaYear: number;
}

// Сравнительный подход — мультипликаторы
export default function MultiplesCalc({ revenueYear, ebitdaYear }: Props) {
  const [rev, setRev] = useState(revenueYear);
  const [ebitda, setEbitda] = useState(ebitdaYear);
  const [pe, setPe] = useState(6);
  const [evEbitda, setEvEbitda] = useState(5);
  const [ps, setPs] = useState(1.2);

  const byEarnings = ebitda * pe;
  const byEbitda = ebitda * evEbitda;
  const bySales = rev * ps;
  const avg = (byEarnings + byEbitda + bySales) / 3;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberField label="Выручка / год, ₽" value={rev} onChange={setRev} step={100000} />
        <NumberField label="EBITDA / год, ₽" value={ebitda} onChange={setEbitda} step={100000} />
        <NumberField label="P/E (отрасль)" value={pe} onChange={setPe} step={0.5} hint="Цена / прибыль" />
        <NumberField label="EV/EBITDA" value={evEbitda} onChange={setEvEbitda} step={0.5} />
        <NumberField label="P/S" value={ps} onChange={setPs} step={0.1} hint="Цена / выручка" />
      </div>
      <div className="bg-muted/40 rounded-xl p-3 space-y-1">
        <ResultRow label="Оценка по P/E" value={fmtRub(byEarnings)} color="blue" />
        <ResultRow label="Оценка по EV/EBITDA" value={fmtRub(byEbitda)} color="blue" />
        <ResultRow label="Оценка по P/S" value={fmtRub(bySales)} color="blue" />
        <ResultRow label="Среднее по 3 методам" value={fmtRub(avg)} color="green" />
      </div>
    </div>
  );
}
