import Icon from '@/components/ui/icon';
import { usePlatformLogos } from '@/contexts/PlatformLogosContext';

/** В разных местах проекта площадка Яндекс.Недвижимость обозначается то 'yandex'
 * (формат XML фида), то 'yandex_realty' (ключ в ad_platform_keys) — приводим к
 * единому ключу логотипа. */
const PLATFORM_KEY_ALIAS: Record<string, string> = {
  yandex: 'yandex_realty',
};

interface Props {
  /** Идентификатор площадки: avito | cian | yandex | yandex_realty | domclick | youla */
  platform: string;
  /** Иконка-заглушка (lucide), используется пока логотип не загружен */
  icon: string;
  size?: number;
  className?: string;
}

/** Показывает логотип площадки, если он загружен в Настройки → XML фиды,
 * иначе — иконку-заглушку (как было раньше). Не требует правок в местах вызова
 * при появлении/удалении логотипа — подхватывает всё из общего контекста. */
export default function PlatformIcon({ platform, icon, size = 16, className }: Props) {
  const { logos } = usePlatformLogos();
  const key = PLATFORM_KEY_ALIAS[platform] || platform;
  const logoUrl = logos[key];

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={className}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 3 }}
      />
    );
  }

  return <Icon name={icon} size={size} className={className} />;
}
