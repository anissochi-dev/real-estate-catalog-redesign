import { useState } from 'react';
import { NumberField, ResultRow, fmtRub } from './utils';

// Затратный подход — балансовая стоимость
export default function CostApproachCalc() {
  const [assets, setAssets] = useState(5_000_000);
  const [depreciation, setDepreciation] = useState(1_000_000);
  const [liabilities, setLiabilities] = useState(2_000_000);
  const [intangibles, setIntangibles] = useState(500_000);
  const [reproductionCost, setReproductionCost] = useState(0);

  const netAssets = assets - depreciation - liabilities + intangibles;
  const fullCost = reproductionCost > 0 ? reproductionCost - depreciation : netAssets;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Активы (всего), ₽" value={assets} onChange={setAssets} step={100000} />
        <NumberField label="Износ / амортизация, ₽" value={depreciation} onChange={setDepreciation} step={100000} />
        <NumberField label="Обязательства (долги), ₽" value={liabilities} onChange={setLiabilities} step={100000} />
        <NumberField label="Немат. активы (бренд, БД), ₽" value={intangibles} onChange={setIntangibles} step={100000} />
        <NumberField label="Стоим. воссоздания, ₽" value={reproductionCost} onChange={setReproductionCost} step={100000} hint="Опционально" />
      </div>
      <div className="bg-muted/40 rounded-xl p-3 space-y-1">
        <ResultRow label="Чистые активы (NAV)" value={fmtRub(netAssets)} color="blue" />
        <ResultRow label="Скорр. стоимость с учётом износа" value={fmtRub(fullCost)} color="green" hint="Затратный подход" />
      </div>
    </div>
  );
}
