function normalizeRuMobile(phone?: string | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const n = '7' + digits.slice(1);
    return n.startsWith('79') ? n : null;
  }
  if (digits.length === 10 && digits.startsWith('9')) return '7' + digits;
  return null;
}

function openInApp(e: React.MouseEvent, appUrl: string, webUrl: string) {
  e.preventDefault();
  e.stopPropagation();
  let left = false;
  const onLeave = () => { left = true; };
  const onVisibility = () => { if (document.hidden) left = true; };
  window.addEventListener('blur', onLeave);
  document.addEventListener('visibilitychange', onVisibility);
  window.location.href = appUrl;
  window.setTimeout(() => {
    window.removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    if (!left) window.open(webUrl, '_blank', 'noopener,noreferrer');
  }, 1500);
}

interface Props {
  phone?: string | null;
  size?: 'xs' | 'sm' | 'md';
}

export default function MessengerLinks({ phone, size = 'sm' }: Props) {
  const n = normalizeRuMobile(phone);
  if (!n) return null;

  const box = size === 'md' ? 'w-[18px] h-[18px]' : size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const items = [
    { key: 'max', title: 'Написать в MAX', href: `https://max.ru/chat?phone=${n}`, app: null as string | null, img: '/messengers/max.png' },
    { key: 'wa', title: 'Написать в WhatsApp (откроется в приложении)', href: `https://wa.me/${n}`, app: `whatsapp://send?phone=${n}`, img: '/messengers/wa.png' },
    { key: 'tg', title: 'Написать в Telegram (откроется в приложении)', href: `https://t.me/+${n}`, app: `tg://resolve?phone=${n}`, img: '/messengers/tg.png' },
  ];

  return (
    <span className={`inline-flex items-center ${size === 'xs' ? 'gap-0.5' : 'gap-1'} flex-shrink-0`}>
      {items.map(i => (
        <a
          key={i.key}
          href={i.href}
          target="_blank"
          rel="noopener noreferrer"
          title={i.title}
          aria-label={i.title}
          onClick={e => (i.app ? openInApp(e, i.app, i.href) : e.stopPropagation())}
          className={`${box} rounded-full inline-block flex-shrink-0 hover:opacity-85 hover:scale-110 transition`}
        >
          <img src={i.img} alt={i.title} width={64} height={64} className="w-full h-full rounded-full block" />
        </a>
      ))}
    </span>
  );
}
