import { useState } from 'react';
import { NumberField, ResultRow, fmtRub, fmtNum, fmtPct } from './utils';

// Точка безубыточности
export default function BreakEvenCalc() {
  const [fixedCost, setFixedCost] = useState(300_000);
  const [pricePerUnit, setPricePerUnit] = useState(1000);
  const [varCostPerUnit, setVarCostPerUnit] = useState(400);
  const [currentSales, setCurrentSales] = useState(800);

  const margin = pricePerUnit - varCostPerUnit;
  const beUnits = margin > 0 ? fixedCost / margin : Infinity;
  const beRevenue = beUnits * pricePerUnit;
  const safetyMargin = currentSales > 0 ? ((currentSales - beUnits) / currentSales) * 100 : 0;
  const operatingLeverage = currentSales > beUnits
    ? (margin * currentSales) / (margin * currentSales - fixedCost)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Пост. расходы / мес, ₽" value={fixedCost} onChange={setFixedCost} step={10000} hint="Аренда, зарплаты" />
        <NumberField label="Цена за единицу, ₽" value={pricePerUnit} onChange={setPricePerUnit} step={50} />
        <NumberField label="Перем. расход на единицу, ₽" value={varCostPerUnit} onChange={setVarCostPerUnit} step={50} />
        <NumberField label="Текущие продажи / мес, ед." value={currentSales} onChange={setCurrentSales} step={10} />
      </div>
      <div className="bg-muted/40 rounded-xl p-3 space-y-1">
        <ResultRow label="Точка безубыт. (единиц)" value={fmtNum(beUnits, 0)} color="orange" />
        <ResultRow label="Точка безубыт. (выручка)" value={fmtRub(beRevenue)} color="orange" />
        <ResultRow label="Запас прочности" value={fmtPct(safetyMargin)} color={safetyMargin > 0 ? 'green' : 'red'} hint="Насколько можно упасть" />
        <ResultRow label="Операционный рычаг" value={fmtNum(operatingLeverage, 2)} color="blue" hint="Чувствительность прибыли к выручке" />
      </div>
    </div>
  );
}
