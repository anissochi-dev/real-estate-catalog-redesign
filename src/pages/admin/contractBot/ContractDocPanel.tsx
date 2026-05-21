import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { CONTRACT_BOT_URL } from '@/lib/adminApi';
import { Doc, Session, DOC_TYPES, EXT_ICON, H, getDocTypeLabel } from './types';

interface Props {
  current: Session;
  docs: Doc[];
  uploading: boolean;
  filling: boolean;
  uploadDocType: string;
  setUploadDocType: (v: string) => void;
  setDocs: (fn: (prev: Doc[]) => Doc[]) => void;
  setCurrent: (fn: (prev: Session | null) => Session | null) => void;
  setUploading: (v: boolean) => void;
  setFilling: (v: boolean) => void;
  setSessions: (fn: (prev: Session[]) => Session[]) => void;
  onUploadFile: (file: File, docType: string) => Promise<void>;
  onFillContract: () => void;
}

export default function ContractDocPanel({
  current, docs, uploading, filling,
  uploadDocType, setUploadDocType,
  onUploadFile, onFillContract,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) await onUploadFile(f, uploadDocType);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await onUploadFile(f, uploadDocType);
    e.target.value = '';
  };

  return (
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
                <Icon name={EXT_ICON[d.file_ext] || 'File'} size={15} className="text-muted-foreground" />
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
          defaultValue={current.conditions_text || ''}
          onBlur={async e => {
            const val = e.target.value;
            await fetch(CONTRACT_BOT_URL, {
              method: 'POST', headers: H(),
              body: JSON.stringify({ action: 'update_session', session_id: current.id, conditions_text: val }),
            });
          }}
          rows={4}
          placeholder="Опишите условия: предмет, срок, сумма, особые условия..."
          className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
        />
      </div>

      <button onClick={onFillContract} disabled={filling}
        className="w-full btn-blue text-white py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {filling
          ? <><Icon name="Loader2" size={16} className="animate-spin" />Мелания заполняет...</>
          : <><Icon name="Sparkles" size={16} />Заполнить договор через Мелания</>}
      </button>
    </div>
  );
}
