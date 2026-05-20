import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';

const UPLOAD_URL = 'https://functions.poehali.dev/82b9e0bc-2ffa-4045-a74b-a09985cec2b5';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
const MAX_MB = 20;
const MAX_BYTES = MAX_MB * 1024 * 1024;

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface UploadedFile {
  name: string;
  url: string;
  mime: string;
  size: number;
}

export interface PublicUploaderProps {
  onUploaded?: (files: UploadedFile[]) => void;
  maxFiles?: number;
  label?: string;
  hint?: string;
}

export default function PublicUploader({
  onUploaded,
  maxFiles = 5,
  label = 'Загрузить файлы',
  hint = 'Фотографии (JPEG, PNG, WebP, GIF) и документы (PDF) до 20 МБ',
}: PublicUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ name: string; status: UploadStatus; url?: string; error?: string; mime?: string; size?: number }[]>([]);
  const [dragging, setDragging] = useState(false);

  const processFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, maxFiles - uploads.filter(u => u.status === 'done').length);
    if (!arr.length) return;

    const newEntries = arr.map(f => ({ name: f.name, status: 'uploading' as UploadStatus }));
    setUploads(prev => [...prev, ...newEntries]);

    const results: UploadedFile[] = [];

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const idx = uploads.length + i;

      // Клиентская проверка размера
      if (file.size > MAX_BYTES) {
        setUploads(prev => prev.map((u, j) => j === idx ? { ...u, status: 'error', error: `Файл слишком большой (макс. ${MAX_MB} МБ)` } : u));
        continue;
      }

      try {
        const b64 = await toBase64(file);
        const res = await fetch(UPLOAD_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: b64, kind: 'public' }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Ошибка загрузки');
        }
        setUploads(prev => prev.map((u, j) => j === idx
          ? { ...u, status: 'done', url: data.url, mime: data.mime, size: data.size }
          : u));
        results.push({ name: file.name, url: data.url, mime: data.mime, size: data.size });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
        setUploads(prev => prev.map((u, j) => j === idx ? { ...u, status: 'error', error: msg } : u));
      }
    }

    if (results.length && onUploaded) {
      onUploaded(results);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  const removeUpload = (idx: number) => {
    setUploads(prev => prev.filter((_, i) => i !== idx));
  };

  const doneCount = uploads.filter(u => u.status === 'done').length;
  const canAdd = doneCount < maxFiles;

  return (
    <div className="space-y-3">
      {/* Зона перетаскивания */}
      {canAdd && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-brand-blue bg-brand-blue/5'
              : 'border-border hover:border-brand-blue/50 hover:bg-muted/50'
          }`}
        >
          <Icon name="Upload" size={28} className="mx-auto mb-2 text-muted-foreground" />
          <div className="font-semibold text-sm text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
          {maxFiles > 1 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Можно добавить ещё {maxFiles - doneCount} файл(ов)
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple={maxFiles > 1}
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      )}

      {/* Список файлов */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
              u.status === 'done' ? 'border-emerald-200 bg-emerald-50'
              : u.status === 'error' ? 'border-red-200 bg-red-50'
              : 'border-border bg-muted/30'
            }`}>
              {/* Превью / иконка */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center border border-border">
                {u.status === 'done' && u.mime?.startsWith('image/') && u.url ? (
                  <img src={u.url} alt={u.name} className="w-full h-full object-cover" />
                ) : (
                  <Icon
                    name={u.mime === 'application/pdf' ? 'FileText' : 'Image'}
                    size={18}
                    className="text-muted-foreground"
                  />
                )}
              </div>

              {/* Имя и статус */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-foreground">{u.name}</div>
                {u.status === 'uploading' && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Icon name="Loader2" size={11} className="animate-spin" /> Загрузка...
                  </div>
                )}
                {u.status === 'done' && (
                  <div className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                    <Icon name="CheckCircle2" size={11} /> Загружено
                    {u.size && ` · ${(u.size / 1024).toFixed(0)} КБ`}
                  </div>
                )}
                {u.status === 'error' && (
                  <div className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                    <Icon name="AlertCircle" size={11} /> {u.error}
                  </div>
                )}
              </div>

              {/* Ссылка + удалить */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {u.status === 'done' && u.url && (
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600"
                    title="Открыть"
                    onClick={e => e.stopPropagation()}
                  >
                    <Icon name="ExternalLink" size={14} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => removeUpload(i)}
                  className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-500"
                  title="Удалить"
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}