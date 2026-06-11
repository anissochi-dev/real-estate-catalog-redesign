import Icon from '@/components/ui/icon';
import { SocialPost, PLATFORM_ICONS, CATEGORY_LABELS, DEAL_LABELS, fmtDate, fmtMoney, confidenceColor } from './queueTypes';

interface Props {
  post: SocialPost;
  onApprove: (p: SocialPost, route: 'leads' | 'listings' | 'market') => void;
  onReject: (p: SocialPost) => void;
  onExpandPhoto: (url: string) => void;
}

export default function QueuePostCard({ post: p, onApprove, onReject, onExpandPhoto }: Props) {
  const plt = PLATFORM_ICONS[p.platform] || { label: p.platform, color: 'text-slate-500', icon: 'Globe' };

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {/* Заголовок поста */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`font-semibold ${plt.color}`}>
            <Icon name={plt.icon} size={12} className="inline mr-0.5" />
            {plt.label}
          </span>
          <span>·</span>
          <span>{p.source_id}</span>
          {p.author_name && <><span>·</span><span>{p.author_name}</span></>}
          {p.post_date && <><span>·</span><span>{fmtDate(p.post_date)}</span></>}
        </div>
        {p.post_url && (
          <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
            <Icon name="ExternalLink" size={11} />Оригинал
          </a>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Текст поста */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">
          {p.raw_text || '—'}
        </p>

        {/* Фото */}
        {p.photos && p.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {p.photos.slice(0, 6).map((ph, i) => (
              <button
                key={i}
                onClick={() => onExpandPhoto(ph)}
                className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted border border-border hover:opacity-90 transition"
              >
                <img src={ph} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </button>
            ))}
            {p.photos.length > 6 && (
              <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                +{p.photos.length - 6}
              </div>
            )}
          </div>
        )}

        {/* Распознанные поля */}
        <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-1 mb-1">
            <Icon name="Bot" size={12} className="text-violet-500" />
            <span className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Распознано</span>
            {p.confidence !== null && (
              <span className={`ml-auto text-xs font-semibold ${confidenceColor(p.confidence)}`}>
                {Math.round((p.confidence || 0) * 100)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {p.detected_deal && (
              <div className="flex gap-1">
                <span className="text-muted-foreground">Сделка:</span>
                <span className="font-medium">{DEAL_LABELS[p.detected_deal] || p.detected_deal}</span>
              </div>
            )}
            {p.detected_category && (
              <div className="flex gap-1">
                <span className="text-muted-foreground">Тип:</span>
                <span className="font-medium">{CATEGORY_LABELS[p.detected_category] || p.detected_category}</span>
              </div>
            )}
            {p.detected_price && (
              <div className="flex gap-1">
                <span className="text-muted-foreground">Цена:</span>
                <span className="font-medium">{fmtMoney(p.detected_price)} ₽</span>
              </div>
            )}
            {p.detected_area && (
              <div className="flex gap-1">
                <span className="text-muted-foreground">Площадь:</span>
                <span className="font-medium">{p.detected_area} м²</span>
              </div>
            )}
            {p.detected_phone && (
              <div className="flex gap-1">
                <span className="text-muted-foreground">Телефон:</span>
                <span className="font-medium">{p.detected_phone}</span>
              </div>
            )}
            {p.detected_district && (
              <div className="flex gap-1">
                <span className="text-muted-foreground">Район:</span>
                <span className="font-medium">{p.detected_district}</span>
              </div>
            )}
            {p.detected_address && (
              <div className="flex gap-1 col-span-2">
                <span className="text-muted-foreground">Адрес:</span>
                <span className="font-medium">{p.detected_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Кнопки действий */}
        {p.status === 'pending' && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onApprove(p, 'leads')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"
            >
              <Icon name="UserCheck" size={12} />
              В заявки
            </button>
            <button
              onClick={() => onApprove(p, 'listings')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold"
            >
              <Icon name="Building2" size={12} />
              В объекты
            </button>
            <button
              onClick={() => onApprove(p, 'market')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
            >
              <Icon name="BarChart2" size={12} />
              В статистику
            </button>
            <button
              onClick={() => onReject(p)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold ml-auto"
            >
              <Icon name="X" size={12} />
              Отклонить
            </button>
          </div>
        )}
        {p.status === 'approved_lead' && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <Icon name="CheckCircle2" size={14} />
            Отправлено в заявки{p.result_lead_id ? ` (заявка #${p.result_lead_id})` : ''}
          </div>
        )}
        {p.status === 'approved_listing' && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <Icon name="CheckCircle2" size={14} />
            Отправлено в объекты{p.result_listing_id ? ` (объект #${p.result_listing_id})` : ''}
          </div>
        )}
        {p.status === 'rejected' && (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <Icon name="XCircle" size={14} />
            Отклонено
          </div>
        )}
      </div>
    </div>
  );
}
