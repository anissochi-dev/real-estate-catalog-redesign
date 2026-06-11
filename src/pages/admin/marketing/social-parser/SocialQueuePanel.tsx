import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { SocialPost, ApproveForm } from './queueTypes';
import QueueFilters from './QueueFilters';
import QueuePostCard from './QueuePostCard';
import QueueModals from './QueueModals';

export default function SocialQueuePanel({
  token, apiUrl, onUpdate,
}: { token: string; apiUrl: string; onUpdate: () => void }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [approvePost, setApprovePost] = useState<SocialPost | null>(null);
  const [approveRoute, setApproveRoute] = useState<'leads' | 'listings' | 'market'>('leads');
  const [approveForm, setApproveForm] = useState<ApproveForm | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectPost, setRejectPost] = useState<SocialPost | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  const post = async (body: object) => {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(body),
    }).then(r => r.json());
    return r;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await post({
        action: 'queue_list',
        platform: filterPlatform,
        status: filterStatus,
        limit: 20,
      });
      if (!r.error) {
        setPosts(r.posts || []);
        setTotal(r.total || 0);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterPlatform, filterStatus]);

  const openApprove = (p: SocialPost, route: 'leads' | 'listings' | 'market') => {
    setApprovePost(p);
    setApproveRoute(route);
    setApproveForm({
      name: p.author_name || '',
      phone: p.detected_phone || '',
      message: (p.raw_text || '').slice(0, 300),
      budget: p.detected_price ? String(p.detected_price) : '',
      lead_type: p.detected_deal === 'rent' ? 'offer' : 'offer',
      category: p.detected_category || 'office',
      deal: p.detected_deal || 'sale',
      price: p.detected_price ? String(p.detected_price) : '',
      area: p.detected_area ? String(p.detected_area) : '',
      address: p.detected_address || '',
      district: p.detected_district || '',
      description: p.raw_text || '',
      status: 'moderation',
    });
  };

  const handleApprove = async () => {
    if (!approvePost || !approveForm) return;
    setApproving(true);
    try {
      const override = approveRoute === 'leads'
        ? { name: approveForm.name, phone: approveForm.phone, message: approveForm.message, budget: approveForm.budget ? Number(approveForm.budget) : null, lead_type: approveForm.lead_type }
        : { category: approveForm.category, deal: approveForm.deal, price: approveForm.price ? Number(approveForm.price) : null, area: approveForm.area ? Number(approveForm.area) : null, address: approveForm.address, district: approveForm.district, description: approveForm.description, status: approveForm.status };

      const r = await post({ action: 'queue_approve', post_id: approvePost.id, route: approveRoute, override });
      if (r.error) { toast.error(r.error); return; }

      const msg = approveRoute === 'leads'
        ? `Заявка #${r.lead_id} создана`
        : approveRoute === 'listings'
          ? `Объект #${r.listing_id} создан`
          : 'Добавлено в статистику';
      toast.success(msg);
      setApprovePost(null);
      load(); onUpdate();
    } finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!rejectPost) return;
    setRejecting(true);
    try {
      const r = await post({ action: 'queue_reject', post_id: rejectPost.id, reason: rejectReason });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Пост отклонён');
      setRejectPost(null);
      setRejectReason('');
      load(); onUpdate();
    } finally { setRejecting(false); }
  };

  return (
    <div className="space-y-3">
      {/* Фильтры + счётчик */}
      <QueueFilters
        filterStatus={filterStatus}
        filterPlatform={filterPlatform}
        total={total}
        onStatusChange={setFilterStatus}
        onPlatformChange={setFilterPlatform}
      />

      {/* Посты */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />Загрузка…
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <Icon name="ClipboardList" size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            {filterStatus === 'pending' ? 'Нет постов, ожидающих проверки' : 'Нет постов с таким статусом'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <QueuePostCard
              key={p.id}
              post={p}
              onApprove={openApprove}
              onReject={p => { setRejectPost(p); setRejectReason(''); }}
              onExpandPhoto={setExpandedPhoto}
            />
          ))}
        </div>
      )}

      {/* Моды */}
      <QueueModals
        approvePost={approvePost}
        approveRoute={approveRoute}
        approveForm={approveForm}
        approving={approving}
        rejectPost={rejectPost}
        rejectReason={rejectReason}
        rejecting={rejecting}
        expandedPhoto={expandedPhoto}
        setApprovePost={setApprovePost}
        setApproveForm={setApproveForm}
        setRejectPost={setRejectPost}
        setRejectReason={setRejectReason}
        setExpandedPhoto={setExpandedPhoto}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
