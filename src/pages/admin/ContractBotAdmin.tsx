import { useEffect, useRef, useState } from 'react';
import { CONTRACT_BOT_URL, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

const H = { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() };

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
  { value: 'party1',   label: 'Документы Стороны 1' },
  { value: 'party2',   label: 'Документы Стороны 2' },
  { value: 'template', label: 'Шаблон договора' },
  { value: 'other',    label: 'Прочие документы' },
];

const ALLOWED = ['png','jpg','jpeg','pdf','doc','docx','xls','xlsx'];

interface Session {
  id: number; title: string; contract_type: string;
  status: string; conditions_text?: string; filled_contract?: string;
  result_url?: string; created_at: string; updated_at: string;
}
interface Doc {
  id: number; doc_type: string; file_name: string; file_url: string;
  file_ext: string; uploaded_at: string;
}

export default function ContractBotAdmin() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'session'>('list');
  const [current, setCurrent] = useState<Session | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', contract_type: 'lease', conditions_text: '' });
  const [uploading, setUploading] = useState(false);
  const [filling, setFilling] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('party1');
  const [shareOpen, setShareOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSessions = () => {
    setLoading(true);
    fetch(`${CONTRACT_BOT_URL}?action=sessions`, { headers: H })
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .finally(() => setLoading(false));
  };

  const loadSession = (id: number) => {
    fetch(`${CONTRACT_BOT_URL}?action=session&id=${id}`, { headers: H })
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
        method: 'POST', headers: H,
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
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await fetch(CONTRACT_BOT_URL, {
        method: 'POST', headers: H,
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
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
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
        method: 'POST', headers: H,
        body: JSON.stringify({ action: 'fill_contract', session_id: current.id }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Договор заполнен!');
      setCurrent(prev => prev ? { ...prev, filled_contract: d.filled_contract, result_url: d.result_url, status: 'filled' } : prev);
    } finally {
      setFilling(false);
    }
  };

  const downloadContract = () => {
    if (!current?.filled_contract) return;
    const blob = new Blob([current.filled_contract], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contract_${current.id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyContractText = () => {
    if (!current?.filled_contract) return;
    navigator.clipboard.writeText(current.filled_contract).then(() => toast.success('Текст скопирован'));
  };

  const getDocTypeLabel = (v: string) => DOC_TYPES.find(d => d.value === v)?.label || v;
  const getContractTypeLabel = (v: string) => CONTRACT_TYPES.find(t => t.value === v)?.label || v;

  const extIcon: Record<string, string> = {
    pdf: 'FileText', doc: 'FileText', docx: 'FileText',
    xls: 'FileSpreadsheet', xlsx: 'FileSpreadsheet',
    png: 'Image', jpg: 'Image', jpeg: 'Image',
  };

  // ── СПИСОК СЕССИЙ ──────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-700 text-lg">Бот договоров</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Мелания заполняет договоры на основе документов сторон</p>
        </div>
      </div>

      {/* Создать новый */}
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

      {/* Список */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin mx-auto mb-2" />
          Загрузка...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="FileStack" size={36} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm">Договоров ещё нет. Создайте первый выше.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <button key={s.id} onClick={() => openSession(s)}
              className="w-full bg-white rounded-2xl border border-border px-5 py-4 text-left hover:border-brand-blue/30 hover:shadow-sm transition flex items-center gap-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.status === 'filled' ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                <Icon name={s.status === 'filled' ? 'CheckCircle2' : 'FileText'} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{s.title}</div>
                <div className="text-xs text-muted-foreground">{getContractTypeLabel(s.contract_type)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {s.status === 'filled' ? 'Заполнен' : 'Черновик'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(s.updated_at).toLocaleDateString('ru')}
                </div>
              </div>
              <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── СЕССИЯ ─────────────────────────────────────────────────────────
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
          <div className="text-xs text-muted-foreground">{getContractTypeLabel(current?.contract_type || '')}</div>
        </div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${current?.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {current?.status === 'filled' ? 'Заполнен' : 'Черновик'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Левая колонка: документы */}
        <div className="space-y-4">
          {/* Загрузка документов */}
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

          {/* Загруженные документы */}
          {docs.length > 0 && (
            <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
              <div className="font-semibold text-sm mb-3">Загружено документов: {docs.length}</div>
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

          {/* Условия сделки */}
          <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
            <div className="font-semibold text-sm">Условия сделки</div>
            <textarea
              defaultValue={current?.conditions_text || ''}
              onBlur={async e => {
                if (!current) return;
                await fetch(CONTRACT_BOT_URL, {
                  method: 'POST', headers: H,
                  body: JSON.stringify({ action: 'update_session', session_id: current.id, conditions_text: e.target.value }),
                });
                setCurrent(p => p ? { ...p, conditions_text: e.target.value } : p);
              }}
              rows={4}
              placeholder="Опишите условия: предмет, срок, сумма, особые условия..."
              className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
            />
          </div>

          {/* Кнопка заполнить */}
          <button onClick={fillContract} disabled={filling}
            className="w-full btn-blue text-white py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {filling
              ? <><Icon name="Loader2" size={16} className="animate-spin" />Мелания заполняет договор...</>
              : <><Icon name="Sparkles" size={16} />Заполнить договор через Мелания</>}
          </button>
        </div>

        {/* Правая колонка: результат */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="font-semibold text-sm">Результат договора</div>
              {current?.filled_contract && (
                <div className="flex items-center gap-1.5">
                  <button onClick={copyContractText}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Копировать текст">
                    <Icon name="Copy" size={14} />
                  </button>
                  <button onClick={downloadContract}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Скачать .txt">
                    <Icon name="Download" size={14} />
                  </button>
                  <div className="relative">
                    <button onClick={() => setShareOpen(v => !v)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Поделиться">
                      <Icon name="Share2" size={14} />
                    </button>
                    {shareOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-xl p-3 min-w-[180px]">
                        <button onClick={() => { copyContractText(); setShareOpen(false); }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left">
                          <Icon name="Copy" size={13} /> Копировать текст
                        </button>
                        <button onClick={() => { downloadContract(); setShareOpen(false); }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left">
                          <Icon name="Download" size={13} /> Скачать .txt
                        </button>
                        {current?.result_url && (
                          <a href={current.result_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left"
                            onClick={() => setShareOpen(false)}>
                            <Icon name="ExternalLink" size={13} /> Открыть файл
                          </a>
                        )}
                      </div>
                    )}
                    {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
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
                    {filling ? 'Мелания заполняет договор...' : 'Загрузите документы и нажмите\n«Заполнить договор через Мелания»'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
