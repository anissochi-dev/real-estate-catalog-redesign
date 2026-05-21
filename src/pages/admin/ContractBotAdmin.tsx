import { useEffect, useRef, useState } from 'react';
import { CONTRACT_BOT_URL, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

const H = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': getToken() });

const CONTRACT_TYPES = [
  { value: 'lease',       label: 'Договор аренды' },
  { value: 'sale',        label: 'Договор купли-продажи' },
  { value: 'agency',      label: 'Агентский договор' },
  { value: 'service',     label: 'Договор оказания услуг' },
  { value: 'preliminary', label: 'Предварительный договор' },
  { value: 'intent',      label: 'Соглашение о намерениях' },
  { value: 'custom',      label: 'Произвольный договор' },
];

const DOC_TYPES = [
  { value: 'party1',   label: 'Арендодатель (Сторона 1)' },
  { value: 'party2',   label: 'Арендатор (Сторона 2)' },
  { value: 'template', label: 'Шаблон договора' },
  { value: 'other',    label: 'Прочие документы' },
];

const ALLOWED = ['png', 'jpg', 'jpeg', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];

interface Session {
  id: number; title: string; contract_type: string;
  status: string; conditions_text?: string; filled_contract?: string;
  result_url?: string; created_at: string; updated_at: string;
}
interface Doc {
  id: number; doc_type: string; file_name: string; file_url: string;
  file_ext: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ContractBotAdmin() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'draft' | 'done'>('draft');
  const [view, setView] = useState<'list' | 'session'>('list');
  const [current, setCurrent] = useState<Session | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', contract_type: 'lease', conditions_text: '' });
  const [uploading, setUploading] = useState(false);
  const [filling, setFilling] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('party1');
  const [dlOpen, setDlOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ email: '', phone: '', message: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSessions = () => {
    setLoading(true);
    fetch(`${CONTRACT_BOT_URL}?action=sessions`, { headers: H() })
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => toast.error('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  const loadSession = (id: number) => {
    fetch(`${CONTRACT_BOT_URL}?action=session&id=${id}`, { headers: H() })
      .then(r => r.json())
      .then(d => {
        if (d.session) { setCurrent(d.session); setDocs(d.documents || []); }
      });
  };

  useEffect(() => { loadSessions(); }, []);  

  const openSession = (s: Session) => {
    setCurrent(s); setView('session');
    loadSession(s.id);
  };

  const createSession = async () => {
    if (!newForm.title.trim()) { toast.error('Введите название договора'); return; }
    setCreating(true);
    try {
      const r = await fetch(CONTRACT_BOT_URL, {
        method: 'POST', headers: H(),
        body: JSON.stringify({ action: 'create_session', ...newForm }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Сессия создана');
      setSessions(prev => [d.session, ...prev]);
      openSession(d.session);
      setNewForm({ title: '', contract_type: 'lease', conditions_text: '' });
    } finally {
      setCreating(false);
    }
  };

  const uploadFile = async (file: File, docType: string) => {
    if (!current) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED.includes(ext)) {
      toast.error(`Формат .${ext} не поддерживается. Разрешены: ${ALLOWED.join(', ')}`);
      return;
    }
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      const r = await fetch(CONTRACT_BOT_URL, {
        method: 'POST', headers: H(),
        body: JSON.stringify({
          action: 'upload_doc',
          session_id: current.id,
          doc_type: docType,
          file_name: file.name,
          file_ext: ext,
          file_base64: b64,
        }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success(`Загружено: ${file.name}`);
      setDocs(prev => [...prev, d.document]);
    } catch {
      toast.error('Ошибка загрузки файла');
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) await uploadFile(f, uploadDocType);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await uploadFile(f, uploadDocType);
    e.target.value = '';
  };

  const fillContract = async () => {
    if (!current) return;
    setFilling(true);
    try {
      const r = await fetch(CONTRACT_BOT_URL, {
        method: 'POST', headers: H(),
        body: JSON.stringify({ action: 'fill_contract', session_id: current.id }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Договор заполнен!');
      const updated = { ...current, filled_contract: d.filled_contract, result_url: d.result_url, status: 'filled' };
      setCurrent(updated);
      setSessions(prev => prev.map(s => s.id === current.id ? { ...s, status: 'filled' } : s));
    } finally {
      setFilling(false);
    }
  };

  const downloadTxt = () => {
    if (!current?.filled_contract) return;
    const blob = new Blob([current.filled_contract], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contract_${current.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadFormat = async (fmt: 'docx' | 'pdf') => {
    if (!current?.filled_contract || !current?.id) return;
    setDownloading(fmt);
    try {
      const r = await fetch(CONTRACT_BOT_URL, {
        method: 'POST', headers: H(),
        body: JSON.stringify({ action: 'download_format', session_id: current.id, format: fmt }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      const binary = atob(d.file_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: d.content_type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = d.filename || `contract_${current.id}.${fmt}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Скачано в формате ${fmt.toUpperCase()}`);
    } finally {
      setDownloading(null);
    }
  };

  const copyText = () => {
    if (!current?.filled_contract) return;
    navigator.clipboard.writeText(current.filled_contract).then(() => toast.success('Скопировано'));
  };

  const openSend = () => {
    setSendForm({ email: '', phone: '', message: `Добрый день!\n\nНаправляю вам договор «${current?.title || ''}».\n\nПожалуйста, ознакомьтесь и подпишите.` });
    setSendOpen(true);
  };

  const sendByEmail = () => {
    if (!sendForm.email.trim()) { toast.error('Введите email'); return; }
    const subject = encodeURIComponent(`Договор: ${current?.title || ''}`);
    const body = encodeURIComponent(sendForm.message + (current?.result_url ? `\n\nСсылка на файл: ${current.result_url}` : ''));
    window.open(`mailto:${sendForm.email}?subject=${subject}&body=${body}`, '_blank');
    toast.success('Открыт почтовый клиент');
    setSendOpen(false);
  };

  const sendByWhatsApp = () => {
    if (!sendForm.phone.trim()) { toast.error('Введите номер телефона'); return; }
    const phone = sendForm.phone.replace(/\D/g, '');
    const text = encodeURIComponent(sendForm.message + (current?.result_url ? `\n\nСсылка на файл: ${current.result_url}` : ''));
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    toast.success('Открыт WhatsApp');
    setSendOpen(false);
  };

  const sendByTelegram = () => {
    const text = encodeURIComponent(sendForm.message + (current?.result_url ? `\n\nСсылка на файл: ${current.result_url}` : ''));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(current?.result_url || '')}&text=${text}`, '_blank');
    toast.success('Открыт Telegram');
    setSendOpen(false);
  };

  const copyFileLink = () => {
    if (!current?.result_url) { toast.error('Сначала заполните договор'); return; }
    navigator.clipboard.writeText(current.result_url).then(() => toast.success('Ссылка скопирована'));
  };

  const getDocTypeLabel = (v: string) => DOC_TYPES.find(d => d.value === v)?.label || v;
  const getTypeLabel = (v: string) => CONTRACT_TYPES.find(t => t.value === v)?.label || v;

  const extIcon: Record<string, string> = {
    pdf: 'FileText', doc: 'FileText', docx: 'FileText',
    xls: 'FileSpreadsheet', xlsx: 'FileSpreadsheet',
    png: 'Image', jpg: 'Image', jpeg: 'Image',
  };

  // ── СПИСОК СЕССИЙ ──────────────────────────────────────────────────
  if (view === 'list') {
    const drafts = sessions.filter(s => s.status !== 'filled');
    const done = sessions.filter(s => s.status === 'filled');
    const shown = tab === 'draft' ? drafts : done;

    return (
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-700 text-lg">Бот договоров</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Мелания заполняет договоры на основе документов сторон</p>
          </div>
        </div>

        {/* Форма создания */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Icon name="FilePlus2" size={16} className="text-brand-blue" />
            Новый договор
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={newForm.title}
              onChange={e => setNewForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Название договора..."
              className="px-3 py-2 border rounded-xl text-sm"
            />
            <select
              value={newForm.contract_type}
              onChange={e => setNewForm(p => ({ ...p, contract_type: e.target.value }))}
              className="px-3 py-2 border rounded-xl text-sm bg-white"
            >
              {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <textarea
            value={newForm.conditions_text}
            onChange={e => setNewForm(p => ({ ...p, conditions_text: e.target.value }))}
            placeholder="Опишите условия сделки: предмет договора, сроки, суммы, особые условия..."
            rows={3}
            className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
          />
          <button onClick={createSession} disabled={creating}
            className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {creating ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Plus" size={14} />}
            Создать
          </button>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
          <button onClick={() => setTab('draft')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'draft' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Черновики <span className="ml-1 text-xs text-muted-foreground">({drafts.length})</span>
          </button>
          <button onClick={() => setTab('done')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'done' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Готовые <span className="ml-1 text-xs text-muted-foreground">({done.length})</span>
          </button>
        </div>

        {/* Список */}
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">
            <Icon name="Loader2" size={22} className="animate-spin mx-auto mb-2" />Загрузка...
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="FileStack" size={36} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">{tab === 'draft' ? 'Черновиков нет.' : 'Готовых договоров пока нет.'}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map(s => (
              <button key={s.id} onClick={() => openSession(s)}
                className="w-full bg-white rounded-2xl border border-border px-5 py-4 text-left hover:border-brand-blue/30 hover:shadow-sm transition flex items-center gap-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.status === 'filled' ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                  <Icon name={s.status === 'filled' ? 'CheckCircle2' : 'FileText'} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{getTypeLabel(s.contract_type)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {s.status === 'filled' ? 'Готов' : 'Черновик'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(s.updated_at).toLocaleDateString('ru')}</div>
                </div>
                <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── РЕДАКТОР СЕССИИ ────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-4">
      {/* Хедер */}
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list'); loadSessions(); }}
          className="p-2 rounded-xl hover:bg-muted transition text-muted-foreground">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <div className="flex-1">
          <div className="font-display font-700 text-lg">{current?.title || 'Договор'}</div>
          <div className="text-xs text-muted-foreground">{getTypeLabel(current?.contract_type || '')}</div>
        </div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${current?.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {current?.status === 'filled' ? 'Готов' : 'Черновик'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Левая: документы + условия */}
        <div className="space-y-4">

          {/* Загрузка */}
          <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Icon name="Upload" size={15} className="text-brand-blue" />
              Загрузить документы сторон
            </div>
            <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm bg-white">
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-brand-blue/40 hover:bg-brand-blue/5 transition"
            >
              {uploading ? (
                <><Icon name="Loader2" size={24} className="animate-spin mx-auto mb-2 text-brand-blue" /><div className="text-sm text-muted-foreground">Загрузка...</div></>
              ) : (
                <>
                  <Icon name="UploadCloud" size={28} className="mx-auto mb-2 text-muted-foreground/50" />
                  <div className="text-sm font-medium">Перетащите файлы или нажмите</div>
                  <div className="text-xs text-muted-foreground mt-1">PNG, JPG, PDF, DOC, DOCX, XLS, XLSX · до 10 МБ</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" multiple
              accept=".png,.jpg,.jpeg,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileInput} />
          </div>

          {/* Загруженные */}
          {docs.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
              <div className="font-semibold text-sm mb-1">Загружено: {docs.length}</div>
              {docs.map(d => (
                <div key={d.id} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon name={extIcon[d.file_ext] || 'File'} size={15} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate font-medium">{d.file_name}</div>
                    <div className="text-xs text-muted-foreground">{getDocTypeLabel(d.doc_type)}</div>
                  </div>
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition">
                    <Icon name="ExternalLink" size={13} />
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Условия */}
          <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
            <div className="font-semibold text-sm">Условия сделки</div>
            <textarea
              defaultValue={current?.conditions_text || ''}
              onBlur={async e => {
                if (!current) return;
                const val = e.target.value;
                await fetch(CONTRACT_BOT_URL, {
                  method: 'POST', headers: H(),
                  body: JSON.stringify({ action: 'update_session', session_id: current.id, conditions_text: val }),
                });
                setCurrent(prev => prev ? { ...prev, conditions_text: val } : prev);
              }}
              rows={4}
              placeholder="Опишите условия: предмет, срок, сумма, особые условия..."
              className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
            />
          </div>

          <button onClick={fillContract} disabled={filling}
            className="w-full btn-blue text-white py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {filling
              ? <><Icon name="Loader2" size={16} className="animate-spin" />Мелания заполняет...</>
              : <><Icon name="Sparkles" size={16} />Заполнить договор через Мелания</>}
          </button>
        </div>

        {/* Правая: результат */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="font-semibold text-sm">Результат</div>
              {current?.filled_contract && (
                <div className="flex items-center gap-1.5">
                  <button onClick={copyText}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Копировать текст">
                    <Icon name="Copy" size={14} />
                  </button>
                  <button onClick={openSend}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-blue text-white hover:opacity-90 transition text-xs font-medium">
                    <Icon name="Send" size={13} /> Отправить
                  </button>
                  <div className="relative">
                    <button onClick={() => setDlOpen(v => !v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition text-xs font-medium border border-border">
                      <Icon name="Download" size={13} /> Скачать
                    </button>
                    {dlOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-xl p-3 min-w-[200px]">
                        <div className="text-xs text-muted-foreground font-semibold px-2 mb-2">Формат</div>
                        <button onClick={() => { downloadTxt(); setDlOpen(false); }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left">
                          <Icon name="FileText" size={13} className="text-muted-foreground" /> Скачать .TXT
                        </button>
                        <button onClick={() => { downloadFormat('docx'); setDlOpen(false); }}
                          disabled={downloading === 'docx'}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left disabled:opacity-50">
                          {downloading === 'docx'
                            ? <Icon name="Loader2" size={13} className="animate-spin" />
                            : <Icon name="FileType" size={13} className="text-blue-600" />}
                          Скачать .DOCX
                        </button>
                        <button onClick={() => { downloadFormat('pdf'); setDlOpen(false); }}
                          disabled={downloading === 'pdf'}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left disabled:opacity-50">
                          {downloading === 'pdf'
                            ? <Icon name="Loader2" size={13} className="animate-spin" />
                            : <Icon name="FileType2" size={13} className="text-red-600" />}
                          Скачать .PDF
                        </button>
                        <div className="border-t border-border mt-2 pt-2">
                          <button onClick={() => { copyText(); setDlOpen(false); }}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left">
                            <Icon name="Copy" size={13} /> Копировать текст
                          </button>
                          {current?.result_url && (
                            <a href={current.result_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left"
                              onClick={() => setDlOpen(false)}>
                              <Icon name="ExternalLink" size={13} /> Открыть файл
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {dlOpen && <div className="fixed inset-0 z-40" onClick={() => setDlOpen(false)} />}
                  </div>
                </div>
              )}
            </div>
            <div className="p-5">
              {current?.filled_contract ? (
                <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-foreground max-h-[600px] overflow-y-auto">
                  {current.filled_contract}
                </pre>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Icon name="FileSearch" size={36} className="mx-auto mb-3 opacity-30" />
                  <div className="text-sm">
                    {filling
                      ? 'Мелания заполняет договор...'
                      : 'Загрузите документы и нажмите\n«Заполнить договор через Мелания»'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно отправки */}
      {sendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display font-700 text-base">Отправить договор</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">{current?.title}</div>
              </div>
              <button onClick={() => setSendOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition">
                <Icon name="X" size={16} />
              </button>
            </div>

            {/* Сообщение */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сообщение</label>
              <textarea
                value={sendForm.message}
                onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
              <div className="flex gap-2">
                <input
                  value={sendForm.email}
                  onChange={e => setSendForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="client@mail.ru"
                  type="email"
                  className="flex-1 px-3 py-2 border rounded-xl text-sm"
                />
                <button onClick={sendByEmail}
                  className="px-3 py-2 rounded-xl bg-brand-blue text-white text-sm font-medium hover:opacity-90 transition inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Icon name="Mail" size={14} /> Открыть
                </button>
              </div>
            </div>

            {/* Телефон */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Телефон (WhatsApp / Telegram)</label>
              <input
                value={sendForm.phone}
                onChange={e => setSendForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+79001234567"
                type="tel"
                className="w-full px-3 py-2 border rounded-xl text-sm"
              />
              <div className="flex gap-2">
                <button onClick={sendByWhatsApp}
                  className="flex-1 py-2 rounded-xl bg-green-500 text-white text-sm font-medium hover:opacity-90 transition inline-flex items-center justify-center gap-1.5">
                  <Icon name="MessageCircle" size={14} /> WhatsApp
                </button>
                <button onClick={sendByTelegram}
                  className="flex-1 py-2 rounded-xl bg-sky-500 text-white text-sm font-medium hover:opacity-90 transition inline-flex items-center justify-center gap-1.5">
                  <Icon name="Send" size={14} /> Telegram
                </button>
              </div>
            </div>

            {/* Ссылка на файл */}
            {current?.result_url && (
              <div className="pt-1 border-t border-border flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground truncate">{current.result_url}</div>
                <button onClick={copyFileLink}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition inline-flex items-center gap-1">
                  <Icon name="Link" size={12} /> Копировать ссылку
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}