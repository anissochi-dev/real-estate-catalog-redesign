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

interface UploadItem {
  key: string;
  name: string;
  status: 'pending' | 'error';
  error?: string;
}

export function TabDocuments({ listingId }: { listingId: number }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingVal, setRenamingVal] = useState('');
  const [shareDocId, setShareDocId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploading = uploadQueue.some(u => u.status === 'pending');
  const canUpload = user?.role && ['admin', 'director', 'broker', 'office_manager'].includes(user.role);

  const loadDocs = () => {
    adminApi.getListingDocuments(listingId).then(r => {
      setDocs(r.documents || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs(); }, [listingId]);

  // Массовая загрузка: каждый файл грузится независимо, ошибка одного
  // не блокирует остальные. Прогресс каждого файла отражается в очереди.
  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const items: UploadItem[] = list.map(f => ({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, status: 'pending' }));
    setUploadQueue(q => [...q, ...items]);

    await Promise.all(list.map(async (file, idx) => {
      const key = items[idx].key;
      try {
        const url = await uploadFile(file, 'document');
        await adminApi.addListingDocument(listingId, file.name, url);
        setUploadQueue(q => q.filter(u => u.key !== key));
        loadDocs();
      } catch (e: unknown) {
        setUploadQueue(q => q.map(u => u.key === key
          ? { ...u, status: 'error', error: e instanceof Error ? e.message : 'Ошибка загрузки' }
          : u));
      }
    }));
  };

  const dismissError = (key: string) => setUploadQueue(q => q.filter(u => u.key !== key));

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

  const acceptExt = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.rar,.jpg,.jpeg,.png,.webp,.heic';

  return (
    <div
      className={`p-6 space-y-4 rounded-2xl transition-colors ${dragOver ? 'bg-brand-blue/5 ring-2 ring-brand-blue/40 ring-inset' : ''}`}
      onDragOver={e => { if (canUpload) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={e => {
        if (!canUpload) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Документы объекта</div>
          <div className="text-xs text-muted-foreground mt-0.5">Фото и документы любых форматов — можно выбрать сразу несколько</div>
        </div>
        {canUpload && (
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            <Icon name={uploading ? 'Loader2' : 'Upload'} size={15} className={uploading ? 'animate-spin' : ''} />
            {uploading ? 'Загрузка...' : 'Добавить файлы'}
          </button>
        )}
        <input ref={inputRef} type="file" multiple className="hidden"
          accept={acceptExt}
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {uploadQueue.length > 0 && (
        <div className="space-y-1.5">
          {uploadQueue.map(u => (
            <div key={u.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${u.status === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-muted/40 text-muted-foreground'}`}>
              <Icon name={u.status === 'error' ? 'AlertCircle' : 'Loader2'} size={13} className={u.status === 'pending' ? 'animate-spin shrink-0' : 'shrink-0'} />
              <span className="truncate flex-1">{u.name}</span>
              {u.status === 'error' ? (
                <>
                  <span className="shrink-0">{u.error}</span>
                  <button onClick={() => dismissError(u.key)} className="shrink-0 hover:text-red-900"><Icon name="X" size={13} /></button>
                </>
              ) : (
                <span className="shrink-0">Загрузка…</span>
              )}
            </div>
          ))}
        </div>
      )}

      {docs.length === 0 ? (
        <div
          className={`py-10 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl transition-colors ${dragOver ? 'border-brand-blue bg-brand-blue/5' : 'border-border'}`}
          onClick={() => canUpload && inputRef.current?.click()}
          onDragOver={e => { if (canUpload) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            if (!canUpload) return;
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
          }}
          style={{ cursor: canUpload ? 'pointer' : 'default' }}>
          <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
          {canUpload ? 'Перетащите файлы сюда или нажмите для добавления' : 'Нет прикреплённых документов'}
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
                    {doc.uploader_name ? ` · ${doc.uploader_name}` : ''}
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