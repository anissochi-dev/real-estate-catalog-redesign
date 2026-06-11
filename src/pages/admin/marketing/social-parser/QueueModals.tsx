import Icon from '@/components/ui/icon';
import { SocialPost, ApproveForm, CATEGORIES_LIST, DISTRICTS_LIST } from './queueTypes';

interface Props {
  approvePost: SocialPost | null;
  approveRoute: 'leads' | 'listings' | 'market';
  approveForm: ApproveForm | null;
  approving: boolean;
  rejectPost: SocialPost | null;
  rejectReason: string;
  rejecting: boolean;
  expandedPhoto: string | null;
  setApprovePost: (p: SocialPost | null) => void;
  setApproveForm: React.Dispatch<React.SetStateAction<ApproveForm | null>>;
  setRejectPost: (p: SocialPost | null) => void;
  setRejectReason: (r: string) => void;
  setExpandedPhoto: (url: string | null) => void;
  onApprove: () => void;
  onReject: () => void;
}

export default function QueueModals({
  approvePost,
  approveRoute,
  approveForm,
  approving,
  rejectPost,
  rejectReason,
  rejecting,
  expandedPhoto,
  setApprovePost,
  setApproveForm,
  setRejectPost,
  setRejectReason,
  setExpandedPhoto,
  onApprove,
  onReject,
}: Props) {
  return (
    <>
      {/* Модал: одобрение → заявка */}
      {approvePost && approveRoute === 'leads' && approveForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2">
                <Icon name="UserCheck" size={16} className="text-blue-600" />
                Создать заявку
              </h3>
              <button onClick={() => setApprovePost(null)} className="p-1 hover:bg-muted rounded-lg"><Icon name="X" size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Имя</label>
                  <input value={approveForm.name} onChange={e => setApproveForm(f => f && ({ ...f, name: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                  <input value={approveForm.phone} onChange={e => setApproveForm(f => f && ({ ...f, phone: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Бюджет, руб</label>
                <input type="number" value={approveForm.budget} onChange={e => setApproveForm(f => f && ({ ...f, budget: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Комментарий</label>
                <textarea value={approveForm.message} onChange={e => setApproveForm(f => f && ({ ...f, message: e.target.value }))}
                  rows={3}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                Источник: <strong>social_{approvePost.platform}</strong> · Статус: <strong>new</strong>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <button onClick={() => setApprovePost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={onApprove} disabled={approving}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {approving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Создать заявку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал: одобрение → объект */}
      {approvePost && approveRoute === 'listings' && approveForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2">
                <Icon name="Building2" size={16} className="text-green-600" />
                Создать объект
              </h3>
              <button onClick={() => setApprovePost(null)} className="p-1 hover:bg-muted rounded-lg"><Icon name="X" size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
                  <select value={approveForm.category} onChange={e => setApproveForm(f => f && ({ ...f, category: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                    {CATEGORIES_LIST.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип сделки</label>
                  <select value={approveForm.deal} onChange={e => setApproveForm(f => f && ({ ...f, deal: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                    <option value="sale">Продажа</option>
                    <option value="rent">Аренда</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Цена, руб</label>
                  <input type="number" value={approveForm.price} onChange={e => setApproveForm(f => f && ({ ...f, price: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Площадь, м²</label>
                  <input type="number" value={approveForm.area} onChange={e => setApproveForm(f => f && ({ ...f, area: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Адрес</label>
                <input value={approveForm.address} onChange={e => setApproveForm(f => f && ({ ...f, address: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Район</label>
                <select value={approveForm.district} onChange={e => setApproveForm(f => f && ({ ...f, district: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                  <option value="">— Не указан —</option>
                  {DISTRICTS_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
                <textarea value={approveForm.description} onChange={e => setApproveForm(f => f && ({ ...f, description: e.target.value }))}
                  rows={3} className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 resize-none" />
              </div>
              {approvePost.photos && approvePost.photos.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                  <Icon name="Image" size={12} className="inline mr-1" />
                  {approvePost.photos.length} фото будут добавлены к объекту
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Статус объекта</label>
                <select value={approveForm.status} onChange={e => setApproveForm(f => f && ({ ...f, status: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
                  <option value="moderation">На модерации</option>
                  <option value="draft">Черновик</option>
                  <option value="active">Активный</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <button onClick={() => setApprovePost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={onApprove} disabled={approving}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {approving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Создать объект
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал: одобрение → рыночная статистика */}
      {approvePost && approveRoute === 'market' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-5">
              <h3 className="font-semibold mb-2">Добавить в рыночную статистику?</h3>
              <p className="text-sm text-muted-foreground">
                Пост будет сохранён в базу рыночных объявлений для аналитики цен. Брокеру не поступит никаких уведомлений.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => setApprovePost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={onApprove} disabled={approving}
                className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {approving && <Icon name="Loader2" size={14} className="animate-spin" />}
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал: отклонение */}
      {rejectPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-5">
              <h3 className="font-semibold mb-3">Отклонить пост</h3>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Причина (необязательно)…"
                rows={3}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => setRejectPost(null)} className="px-4 py-2 border border-border rounded-xl text-sm">Отмена</button>
              <button onClick={onReject} disabled={rejecting}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {rejecting && <Icon name="Loader2" size={14} className="animate-spin" />}
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Просмотр фото */}
      {expandedPhoto && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setExpandedPhoto(null)}>
          <img src={expandedPhoto} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </>
  );
}
