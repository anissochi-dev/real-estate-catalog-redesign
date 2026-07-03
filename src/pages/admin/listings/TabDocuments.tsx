import { useEffect, useState, useRef } from 'react';
import { adminApi, uploadFile } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { DbDoc } from './internalCardTypes';
import { Spinner } from './InternalCardTabs1';

const MESSENGERS = [
  { label: 'WhatsApp', icon: 'MessageCircle', color: 'text-green-600', href: (url: string, name: string) => `https://wa.me/?text=${encodeURIComponent(`${name}: ${url}`)}` },
  { label: 'Telegram', icon: 'Send', color: 'text-blue-500', href: (url: string, name: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(name)}` },
  { label: 'Viber', icon: 'Phone', color: 'text-violet-600', href: (url: string, name: string) => `viber://forward?text=${encodeURIComponent(`${name}: ${url}`)}` },
  { label: 'Email', icon: 'Mail', color: 'text-muted-foreground', href: (url: string, name: string) => `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(url)}` },
];

export function TabDocuments({ listingId }: { listingId: number }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingVal, setRenamingVal] = useState('');
  const [shareDocId, setShareDocId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);

  const loadDocs = () => {
    adminApi.getListingDocuments(listingId).then(r => {
      setDocs(r.documents || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs(); }, [listingId]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file, 'document');
      await adminApi.addListingDocument(listingId, file.name, url);
      loadDocs();
    } catch (e: unknown) {
      alert('Ошибка загрузки: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId: number) => {
    if (!confirm('Удалить документ?')) return;
    await adminApi.deleteListingDocument(docId);
    loadDocs();
  };

  const saveRename = async (docId: number) => {
    if (!renamingVal.trim()) return;
    await adminApi.renameListingDocument(docId, renamingVal.trim());
    setRenamingId(null);
    loadDocs();
  };

  const downloadDoc = async (doc: DbDoc) => {
    try {
      const res = await fetch(doc.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(doc.url, '_blank');
    }
  };

  const shareDoc = (doc: DbDoc) => {
    setShareDocId(doc.id === shareDocId ? null : doc.id);
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Документы объекта</div>
          <div className="text-xs text-muted-foreground mt-0.5">Видны только в административной панели</div>
        </div>
        {canUpload && (
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            <Icon name={uploading ? 'Loader2' : 'Upload'} size={15} className={uploading ? 'animate-spin' : ''} />
            {uploading ? 'Загрузка...' : 'Добавить'}
          </button>
        )}
        <input ref={inputRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      {docs.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl"
          onClick={() => canUpload && inputRef.current?.click()}
          style={{ cursor: canUpload ? 'pointer' : 'default' }}>
          <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
          Нет прикреплённых документов{canUpload ? ' — нажмите для добавления' : ''}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <Icon name="FileText" size={18} className="text-brand-blue shrink-0" />
                <div className="flex-1 min-w-0">
                  {renamingId === doc.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        value={renamingVal}
                        onChange={e => setRenamingVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRename(doc.id); if (e.key === 'Escape') setRenamingId(null); }}
                        className="flex-1 px-2 py-1 border border-border rounded-lg text-sm"
                        autoFocus
                      />
                      <button onClick={() => saveRename(doc.id)} className="text-xs text-brand-blue font-semibold">Сохранить</button>
                      <button onClick={() => setRenamingId(null)} className="text-xs text-muted-foreground">Отмена</button>
                    </div>
                  ) : (
                    <div className="text-sm font-medium truncate">{doc.name}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(doc.created_at).toLocaleDateString('ru')}
                    {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => downloadDoc(doc)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue transition-colors"
                    title="Скачать">
                    <Icon name="Download" size={14} />
                  </button>
                  <button onClick={() => shareDoc(doc)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue transition-colors"
                    title="Поделиться">
                    <Icon name="Share2" size={14} />
                  </button>
                  {canUpload && (
                    <>
                      <button
                        onClick={() => { setRenamingId(doc.id); setRenamingVal(doc.name); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue transition-colors"
                        title="Переименовать">
                        <Icon name="Pencil" size={14} />
                      </button>
                      <button onClick={() => deleteDoc(doc.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Удалить">
                        <Icon name="Trash2" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {shareDocId === doc.id && (
                <div className="border-t border-border px-4 py-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-2 font-medium">Поделиться документом:</div>
                  <div className="flex flex-wrap gap-2">
                    {MESSENGERS.map(m => (
                      <a key={m.label} href={m.href(doc.url, doc.name)} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-current transition-colors ${m.color}`}>
                        <Icon name={m.icon} size={12} />
                        {m.label}
                      </a>
                    ))}
                    <button
                      onClick={() => { navigator.clipboard.writeText(doc.url); }}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors text-muted-foreground">
                      <Icon name="Copy" size={13} /> Скопировать ссылку
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}