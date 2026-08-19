import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { generatePresentation } from '@/lib/api';

interface Props {
  listingId: number;
  className?: string;
}

export default function PresentationDownloadButton({ listingId, className = '' }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await generatePresentation(listingId);
      if ('error' in result) {
        alert('Не удалось подготовить презентацию. Попробуйте ещё раз.');
        return;
      }
      const a = document.createElement('a');
      a.href = result.url;
      a.download = `presentation-${listingId}.jpg`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert('Не удалось подготовить презентацию. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/5 transition-colors rounded-xl py-2.5 disabled:opacity-50 ${className}`}
    >
      {loading ? (
        <><Icon name="Loader2" size={15} className="animate-spin" /> Подготовка...</>
      ) : (
        <><Icon name="Download" size={15} /> Скачать презентацию</>
      )}
    </button>
  );
}
