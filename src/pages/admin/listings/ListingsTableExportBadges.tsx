import { Listing } from './types';
import { usePlatformLogos } from '@/contexts/PlatformLogosContext';

const PLATFORM_KEY_ALIAS: Record<string, string> = { yandex: 'yandex_realty' };

function Badge({ platform, letter, title, cls }: { platform: string; letter: string; title: string; cls: string }) {
  const { logos } = usePlatformLogos();
  const logoUrl = logos[PLATFORM_KEY_ALIAS[platform] || platform];
  if (logoUrl) {
    return (
      <span title={title} className="w-4 h-4 rounded overflow-hidden border border-border shrink-0 inline-flex items-center justify-center bg-white">
        <img src={logoUrl} alt="" className="w-full h-full object-contain" />
      </span>
    );
  }
  return (
    <span title={title} className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 border ${cls}`}>{letter}</span>
  );
}

export default function ListingsTableExportBadges({ it }: { it: Listing }) {
  if (!it.export_yandex && !it.export_avito && !it.export_cian && !it.export_youla && !it.export_other) return null;
  return (
    <div className="flex items-center gap-1">
      {it.export_yandex && (
        <Badge platform="yandex" letter="Я" title="Яндекс.Недвижимость" cls="bg-red-50 text-red-600 border-red-200" />
      )}
      {it.export_avito && (
        <Badge platform="avito" letter="А" title="Авито" cls="bg-teal-50 text-teal-700 border-teal-200" />
      )}
      {it.export_cian && (
        <Badge platform="cian" letter="Ц" title="ЦИАН" cls="bg-sky-50 text-sky-700 border-sky-200" />
      )}
      {it.export_youla && (
        <Badge platform="youla" letter="Ю" title="Юла" cls="bg-purple-50 text-purple-700 border-purple-200" />
      )}
      {it.export_other && (
        <span title="Разное (доп. площадки)"
          className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-violet-50 text-violet-700 border border-violet-200">Р</span>
      )}
    </div>
  );
}
