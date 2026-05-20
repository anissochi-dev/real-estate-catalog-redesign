import { useEffect, useState, useRef } from 'react';
import { adminApi, aiApi, uploadFile } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Listing, fmtDate } from './types';
import { AiMsg, DbDoc, BrokerUser } from './internalCardTypes';
import { Spinner } from './InternalCardTabs1';

export function TabAi({ listing }: { listing: Listing }) {
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    setLoading(true);
    if (text !== '__auto__') setMessages(m => [...m, { role: 'user', text }]);
    try {
      const prompt = text === '__auto__'
        ? `Ты — Мелания, личный ИИ-помощник коммерческого брокера. Проанализируй объект и дай конкретные рекомендации как авитолог, маркетолог и профессиональный коммерческий брокер.\n\nОбъект: ${listing.title}\nКатегория: ${listing.category}, площадь: ${listing.area}м², цена: ${listing.price}₽\nАдрес: ${listing.address || listing.district || listing.city}\nОписание: ${listing.description || '—'}\n\nОтветь структурированно:\n1. На что обратить внимание\n2. Стоит ли снизить/повысить цену\n3. Что изменить в названии\n4. Что улучшить в описании\n5. Рекомендации по фото и размещению`
        : text;
      const r = await aiApi.ask('marketing', prompt);
      setMessages(m => [...m, { role: 'ai', text: r.text }]);
      if (text === '__auto__') {
        await adminApi.addListingComment(listing.id, `[Мелания] ${r.text}`, true).catch(() => {});
      }
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Ошибка при обращении к Мелании. Попробуйте ещё раз.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  useEffect(() => {
    if (!asked) { setAsked(true); ask('__auto__'); }
  }, []);

  const send = () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    ask(q);
  };

  const applyChange = async (field: 'title' | 'description', value: string) => {
    setApplying(field);
    try {
      await adminApi.updateListing(listing.id, { [field]: value });
      await adminApi.addListingHistory(listing.id, 'updated', { [field]: [(listing as Record<string, unknown>)[field], value] });
      setMessages(m => [...m, { role: 'ai', text: `Поле "${field === 'title' ? 'название' : 'описание'}" успешно обновлено.` }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Не удалось применить изменение.' }]);
    } finally {
      setApplying(null);
    }
  };

  const lastAiText = [...messages].reverse().find(m => m.role === 'ai')?.text || '';

  return (
    <div className="flex flex-col" style={{ minHeight: 500 }}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 420 }}>
        {messages.length === 0 && loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="Loader2" size={16} className="animate-spin text-brand-orange" />
            Мелания анализирует объект...
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === 'user') return (
            <div key={i} className="flex justify-end">
              <div className="bg-brand-blue text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[75%]">{m.text}</div>
            </div>
          );
          return (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="Sparkles" size={14} className="text-brand-orange" />
              </div>
              <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm max-w-[80%] whitespace-pre-wrap leading-relaxed">{m.text}</div>
            </div>
          );
        })}
        {loading && messages.length > 0 && (
          <div className="flex gap-2 items-center text-xs text-muted-foreground">
            <Icon name="Loader2" size={14} className="animate-spin" /> Мелания печатает...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {lastAiText && (
        <div className="px-5 py-2 border-t border-border bg-amber-50/50">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium">Применить рекомендации Мелании:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const match = lastAiText.match(/название[:\s«"]+([^»"\n]{5,100})/i);
                if (match) applyChange('title', match[1].trim());
                else ask('Предложи конкретное новое название для этого объекта одной строкой, без пояснений.');
              }}
              disabled={!!applying}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {applying === 'title' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Pencil" size={12} />}
              Применить к названию
            </button>
            <button
              onClick={() => {
                const match = lastAiText.match(/описание[:\s«"]+([^»"]{20,})/i);
                if (match) applyChange('description', match[1].trim());
                else ask('Напиши новое описание для этого объекта (2-4 абзаца), без вводных слов.');
              }}
              disabled={!!applying}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-blue hover:text-brand-blue transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {applying === 'description' ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="FileText" size={12} />}
              Применить к описанию
            </button>
            <button
              onClick={() => ask('Предложи новое название и описание для этого объекта. Формат — сначала строка "Название: ..." затем "Описание: ..."')}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:border-brand-orange hover:text-brand-orange transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Icon name="RefreshCw" size={12} /> Переписать всё
            </button>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-2 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Задать вопрос Мелании..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-brand-blue"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            <Icon name="Send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

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
      const url = await uploadFile(file, 'photos');
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

  const MESSENGERS = [
    { label: 'WhatsApp', icon: 'MessageCircle', color: 'text-green-600', href: (url: string, name: string) => `https://wa.me/?text=${encodeURIComponent(`${name}: ${url}`)}` },
    { label: 'Telegram', icon: 'Send', color: 'text-blue-500', href: (url: string, name: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(name)}` },
    { label: 'Viber', icon: 'Phone', color: 'text-violet-600', href: (url: string, name: string) => `viber://forward?text=${encodeURIComponent(`${name}: ${url}`)}` },
    { label: 'Email', icon: 'Mail', color: 'text-muted-foreground', href: (url: string, name: string) => `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(url)}` },
  ];

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
                        className="flex-1 px-2 py-1 border border-brand-blue rounded text-sm outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveRename(doc.id)} className="text-xs text-brand-blue font-semibold">Сохранить</button>
                      <button onClick={() => setRenamingId(null)} className="text-xs text-muted-foreground">Отмена</button>
                    </div>
                  ) : (
                    <div className="text-sm font-medium truncate">{doc.name}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(doc.created_at)}{doc.uploader_name ? ` · ${doc.uploader_name}` : ''}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                    title="Открыть"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand-blue">
                    <Icon name="ExternalLink" size={14} />
                  </a>
                  <button onClick={() => downloadDoc(doc)} title="Скачать"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-emerald-600">
                    <Icon name="Download" size={14} />
                  </button>
                  <button onClick={() => shareDoc(doc)} title="Поделиться"
                    className={`p-2 rounded-lg hover:bg-muted transition-colors ${shareDocId === doc.id ? 'text-brand-orange' : 'text-muted-foreground hover:text-brand-orange'}`}>
                    <Icon name="Share2" size={14} />
                  </button>
                  {canUpload && (
                    <>
                      <button onClick={() => { setRenamingId(doc.id); setRenamingVal(doc.name); }} title="Переименовать"
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-600">
                        <Icon name="Pencil" size={14} />
                      </button>
                      <button onClick={() => deleteDoc(doc.id)} title="Удалить"
                        className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500">
                        <Icon name="Trash2" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {shareDocId === doc.id && (
                <div className="px-4 py-3 bg-muted/30 border-t border-border flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground self-center">Отправить через:</span>
                  {MESSENGERS.map(m => (
                    <a key={m.label} href={m.href(doc.url, doc.name)} target="_blank" rel="noopener noreferrer"
                      className={`text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-muted inline-flex items-center gap-1.5 ${m.color}`}>
                      <Icon name={m.icon} size={13} />
                      {m.label}
                    </a>
                  ))}
                  <button
                    onClick={() => { navigator.clipboard?.writeText(doc.url); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-muted inline-flex items-center gap-1.5 text-muted-foreground">
                    <Icon name="Copy" size={13} /> Скопировать ссылку
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TabBroker({ listing, onSaved, currentUserId }: { listing: Listing; onSaved: () => void; currentUserId?: number }) {
  const [users, setUsers] = useState<BrokerUser[]>([]);
  const [selected, setSelected] = useState<number | null>(
    (listing as Record<string, unknown>).broker_id as number | null ?? null
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.listUsers().then(r => {
      const all: BrokerUser[] = r.users || [];
      setUsers(all.filter(u => ['admin', 'director', 'broker', 'office_manager', 'manager'].includes(u.role)));
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateListing(listing.id, { broker_id: selected });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const authorName = (listing as Record<string, unknown>).broker_name as string | null
    || (listing as Record<string, unknown>).author_name as string | null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="text-sm font-semibold mb-1">Текущий брокер</div>
        <div className="px-4 py-3 bg-muted/40 rounded-xl text-sm">
          {authorName || (selected ? users.find(u => u.id === selected)?.name : null) || 'Не назначен'}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Передать объект брокеру</div>
        <select
          value={selected ?? ''}
          onChange={e => setSelected(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2.5 border border-border rounded-xl text-sm"
        >
          <option value="">— Не назначен —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} {u.id === currentUserId ? '(я)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving}
          className="mt-3 btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : null}
          {saved ? 'Сохранено!' : 'Сохранить'}
        </button>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        При смене брокера объект будет отображаться в его списке объектов. История изменений сохраняется.
      </div>
    </div>
  );
}