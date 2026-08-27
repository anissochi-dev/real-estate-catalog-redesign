import { useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { uploadFile } from '@/lib/adminApi';
import { Listing } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
}

/** Загрузка ZIP-архива с выпиской ЕГРН — нужна только для выгрузки на Авито
 *  (тег EgrnExtractionLink), поэтому блок показываем только если включена
 *  выгрузка на Авито для этого объекта. */
export default function EgrnZipUpload({ editing, setEditing }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing.export_avito) return null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Нужен файл в формате ZIP');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadFile(file, 'document');
      setEditing({ ...editing, egrn_zip_url: url });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="FileArchive" size={15} className="text-brand-blue flex-shrink-0" />
          <span className="text-sm font-medium">Выписка ЕГРН для Авито</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editing.egrn_zip_url && (
            <a
              href={editing.egrn_zip_url}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-brand-blue hover:underline flex items-center gap-1"
            >
              <Icon name="ExternalLink" size={12} />
              Открыть архив
            </a>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {uploading
              ? <Icon name="Loader2" size={13} className="animate-spin" />
              : <Icon name="Upload" size={13} />}
            {editing.egrn_zip_url ? 'Заменить' : 'Загрузить ZIP'}
          </button>
          {editing.egrn_zip_url && (
            <button
              type="button"
              onClick={() => setEditing({ ...editing, egrn_zip_url: null })}
              className="text-muted-foreground hover:text-red-500 transition-colors"
              title="Удалить"
            >
              <Icon name="Trash2" size={14} />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        ZIP-архив с выпиской из ЕГРН (можно скачать бесплатно на Госуслугах) — Авито использует его для ускоренной модерации объявления.
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
