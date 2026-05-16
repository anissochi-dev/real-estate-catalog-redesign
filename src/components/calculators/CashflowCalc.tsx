import { useState, useMemo } from 'react';
import { NumberField, ResultRow, fmtRub, fmtMonths, fmtPct } from './utils';

interface Props {
  price: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

export default function CashflowCalc({ price, monthlyIncome, monthlyExpenses }: Props) {
  const [income, setIncome] = useState(monthlyIncome);
  const [expenses, setExpenses] = useState(monthlyExpenses);
  const [invest, setInvest] = useState(price);

  const profit = income - expenses;
  const yearProfit = profit * 12;
  const margin = income > 0 ? (profit / income) * 100 : 0;
  const payback = profit > 0 ? invest / profit : Infinity;
  const roiYear = invest > 0 ? (yearProfit / invest) * 100 : 0;

  return useMemo(() => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumberField label="Инвестиции, ₽" value={invest} onChange={setInvest} step={100000} />
        <NumberField label="Доход в месяц, ₽" value={income} onChange={setIncome} step={10000} />
        <NumberField label="Расходы в месяц, ₽" value={expenses} onChange={setExpenses} step={10000} />
      </div>
      <div className="bg-muted/40 rounded-xl p-3 space-y-1">
        <ResultRow label="Чистая прибыль / мес" value={fmtRub(profit)} color={profit >= 0 ? 'green' : 'red'} />
        <ResultRow label="Чистая прибыль / год" value={fmtRub(yearProfit)} color={yearProfit >= 0 ? 'green' : 'red'} />
        <ResultRow label="Рентабельность" value={fmtPct(margin)} color="blue" hint="Прибыль / доход" />
        <ResultRow label="ROI годовой" value={fmtPct(roiYear)} color="blue" hint="Прибыль за год / инвестиции" />
        <ResultRow label="Окупаемость" value={fmtMonths(payback)} color="orange" />
      </div>
    </div>
  ), [invest, income, expenses, profit, yearProfit, margin, payback, roiYear]);
}
