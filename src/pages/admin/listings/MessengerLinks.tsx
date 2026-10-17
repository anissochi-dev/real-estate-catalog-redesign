import Icon from '@/components/ui/icon';

function normalizeRuMobile(phone?: string | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const n = '7' + digits.slice(1);
    return n.startsWith('79') ? n : null;
  }
  if (digits.length === 10 && digits.startsWith('9')) return '7' + digits;
  return null;
}

interface Props {
  phone?: string | null;
  size?: 'sm' | 'md';
}

export default function MessengerLinks({ phone, size = 'sm' }: Props) {
  const n = normalizeRuMobile(phone);
  if (!n) return null;

  const box = size === 'md' ? 'w-7 h-7' : 'w-5 h-5';
  const ico = size === 'md' ? 15 : 11;
  const items = [
    { key: 'max', title: 'Написать в MAX', href: `https://max.ru/chat?phone=${n}`, icon: 'MessagesSquare', cls: 'bg-violet-600' },
    { key: 'wa', title: 'Написать в WhatsApp', href: `https://wa.me/${n}`, icon: 'MessageCircle', cls: 'bg-emerald-500' },
    { key: 'tg', title: 'Написать в Telegram', href: `https://t.me/+${n}`, icon: 'Send', cls: 'bg-sky-500' },
  ];

  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      {items.map(i => (
        <a
          key={i.key}
          href={i.href}
          target="_blank"
          rel="noopener noreferrer"
          title={i.title}
          aria-label={i.title}
          onClick={e => e.stopPropagation()}
          className={`${box} ${i.cls} text-white rounded-full inline-flex items-center justify-center hover:opacity-85 transition-opacity`}
        >
          <Icon name={i.icon} size={ico} />
        </a>
      ))}
    </span>
  );
}
