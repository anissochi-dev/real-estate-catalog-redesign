import { Listing } from './types';

export default function ListingsTableExportBadges({ it }: { it: Listing }) {
  if (!it.export_yandex && !it.export_avito && !it.export_cian && !it.export_other) return null;
  return (
    <div className="flex items-center gap-1">
      {it.export_yandex && (
        <span title="Яндекс.Недвижимость"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Я</span>
      )}
      {it.export_avito && (
        <span title="Авито"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">А</span>
      )}
      {it.export_cian && (
        <span title="ЦИАН"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">Ц</span>
      )}
      {it.export_other && (
        <span title="Разное (доп. площадки)"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">Р</span>
      )}
    </div>
  );
}