import { useEffect, useState } from 'react';
import { CONTRACT_BOT_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import {
  H, Session, Doc, ALLOWED, fileToBase64, getTypeLabel,
} from './contractBot/types';
import ContractSessionList from './contractBot/ContractSessionList';
import ContractDocPanel from './contractBot/ContractDocPanel';
import ContractResultPanel from './contractBot/ContractResultPanel';

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
  const [downloading, setDownloading] = useState<string | null>(null);

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
      if (d.error || !d.session) { toast.error(d.error || 'Ошибка создания сессии'); return; }
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

  const fillContract = async () => {
    if (!current) return;
    setFilling(true);
    // Информируем юзера о ходе процесса — генерация ИИ может идти 5-15 секунд
    const startMsg = toast.loading('🤖 Мелания анализирует документы…');
    const phaseTimer = setTimeout(() => {
      toast.loading('✍️ Формирует текст договора…', { id: startMsg });
    }, 4000);
    const phaseTimer2 = setTimeout(() => {
      toast.loading('📄 Сохраняет результат…', { id: startMsg });
    }, 9000);

    try {
      const r = await fetch(CONTRACT_BOT_URL, {
        method: 'POST', headers: H(),
        body: JSON.stringify({ action: 'fill_contract', session_id: current.id }),
      });
      const d = await r.json();
      clearTimeout(phaseTimer);
      clearTimeout(phaseTimer2);
      if (r.status === 429) {
        toast.error(d.error || 'Превышен лимит запросов. Попробуйте позже', { id: startMsg });
        return;
      }
      if (d.error) {
        toast.error(d.error, { id: startMsg });
        return;
      }
      toast.success('✅ Договор готов!', { id: startMsg });
      const updated = { ...current, filled_contract: d.filled_contract, result_url: d.result_url, status: 'filled' };
      setCurrent(updated);
      setSessions(prev => prev.map(s => s.id === current.id ? { ...s, status: 'filled' } : s));
    } catch {
      clearTimeout(phaseTimer);
      clearTimeout(phaseTimer2);
      toast.error('Не удалось связаться с ИИ', { id: startMsg });
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

  // ── СПИСОК СЕССИЙ ──────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <ContractSessionList
        sessions={sessions}
        loading={loading}
        tab={tab}
        setTab={setTab}
        newForm={newForm}
        setNewForm={setNewForm}
        creating={creating}
        onCreateSession={createSession}
        onOpenSession={openSession}
      />
    );
  }

  // ── РЕДАКТОР СЕССИИ ────────────────────────────────────────────────
  if (!current) return null;

  return (
    <div className="max-w-4xl space-y-4">
      {/* Хедер */}
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list'); loadSessions(); }}
          className="p-2 rounded-xl hover:bg-muted transition text-muted-foreground">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <div className="flex-1">
          <div className="font-display font-700 text-lg">{current.title}</div>
          <div className="text-xs text-muted-foreground">{getTypeLabel(current.contract_type)}</div>
        </div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${current.status === 'filled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {current.status === 'filled' ? 'Готов' : 'Черновик'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Левая: документы + условия */}
        <ContractDocPanel
          current={current}
          docs={docs}
          uploading={uploading}
          filling={filling}
          uploadDocType={uploadDocType}
          setUploadDocType={setUploadDocType}
          setDocs={setDocs}
          setCurrent={setCurrent}
          setUploading={setUploading}
          setFilling={setFilling}
          setSessions={setSessions}
          onUploadFile={uploadFile}
          onFillContract={fillContract}
        />

        {/* Правая: результат + отправка */}
        <ContractResultPanel
          current={current}
          filling={filling}
          downloading={downloading}
          onDownloadTxt={downloadTxt}
          onDownloadFormat={downloadFormat}
          onCopyText={copyText}
        />
      </div>
    </div>
  );
}