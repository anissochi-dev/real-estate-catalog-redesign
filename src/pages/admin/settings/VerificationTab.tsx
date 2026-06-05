import { useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';

interface VerifFile {
  filename: string;
  content: string;
  comment?: string;
}

interface Props {
  files: VerifFile[];
  onChange: (files: VerifFile[]) => void;
  saved: boolean;
  save: () => Promise<void>;
}

export default function VerificationTab({ files, onChange, saved, save }: Props) {
  const [saving, setSaving] = useState(false);
  const [newFile, setNewFile] = useState<VerifFile>({ filename: '', content: '', comment: '' });
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const addFile = () => {
    if (!newFile.filename.trim() || !newFile.content.trim()) return;
    const filename = newFile.filename.trim().replace(/^\/+/, '');
    onChange([...files, { ...newFile, filename }]);
    setNewFile({ filename: '', content: '', comment: '' });
    setAdding(false);
  };

  const removeFile = (i: number) => {
    onChange(files.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save();
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = (filename: string) => {
    const url = `${LISTINGS_URL}?resource=verify_file&filename=${encodeURIComponent(filename)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(filename);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Файлы верификации</h2>
        <p className="text-sm text-foreground/50 mt-1">
          Для подтверждения домена в Яндекс.Вебмастере, Google Search Console, Mail.ru и других сервисах.
          Добавьте файл — он будет доступен по специальной ссылке.
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((f, i) => (
            <div key={i} className="border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-foreground">{f.filename}</span>
                    {f.comment && (
                      <span className="text-xs text-foreground/40 bg-muted px-2 py-0.5 rounded-full">{f.comment}</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/40 mt-0.5 font-mono truncate">{f.content.slice(0, 80)}{f.content.length > 80 ? '…' : ''}</p>
                </div>
                <button onClick={() => removeFile(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-foreground/30 hover:text-red-500 shrink-0 transition">
                  <Icon name="Trash2" size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                <div className="flex-1 bg-muted rounded-lg px-3 py-1.5 font-mono text-xs text-foreground/50 truncate">
                  {LISTINGS_URL}?resource=verify_file&amp;filename={f.filename}
                </div>
                <button
                  onClick={() => copyUrl(f.filename)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition shrink-0"
                >
                  <Icon name={copied === f.filename ? 'Check' : 'Copy'} size={13} />
                  {copied === f.filename ? 'Скопировано' : 'Скопировать URL'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && !adding && (
        <div className="text-center py-10 text-foreground/30 text-sm border-2 border-dashed border-border rounded-xl">
          <Icon name="FileCheck" size={32} className="mx-auto mb-2 opacity-30" />
          Файлы верификации не добавлены
        </div>
      )}

      {adding && (
        <div className="border border-brand-blue/30 rounded-xl p-4 bg-brand-blue/5 space-y-3">
          <p className="text-sm font-semibold text-foreground/70">Новый файл верификации</p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-foreground/50 mb-1 block">Имя файла</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                placeholder="yandex_1234abcd.html"
                value={newFile.filename}
                onChange={e => setNewFile(p => ({ ...p, filename: e.target.value }))}
              />
              <p className="text-xs text-foreground/40 mt-1">Например: yandex_7099028f3e2220eb.html или google1234abcd.html</p>
            </div>
            <div>
              <label className="text-xs text-foreground/50 mb-1 block">Содержимое файла</label>
              <textarea
                className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none"
                rows={4}
                placeholder="yandex-verification: 7099028f3e2220eb"
                value={newFile.content}
                onChange={e => setNewFile(p => ({ ...p, content: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-foreground/50 mb-1 block">Комментарий (необязательно)</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                placeholder="Яндекс.Вебмастер"
                value={newFile.comment}
                onChange={e => setNewFile(p => ({ ...p, comment: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={addFile}
              disabled={!newFile.filename.trim() || !newFile.content.trim()}
              className="px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-40 transition"
            >
              Добавить
            </button>
            <button onClick={() => { setAdding(false); setNewFile({ filename: '', content: '', comment: '' }); }}
              className="px-4 py-2 rounded-lg text-sm text-foreground/60 hover:bg-muted transition">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-blue/30 text-brand-blue text-sm font-semibold hover:bg-brand-blue/5 transition">
            <Icon name="Plus" size={15} />
            Добавить файл
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition ml-auto"
        >
          <Icon name={saved && !saving ? 'Check' : 'Save'} size={15} />
          {saving ? 'Сохраняем…' : saved ? 'Сохранено!' : 'Сохранить'}
        </button>
      </div>

      <div className="bg-muted/60 rounded-xl p-4 text-sm space-y-2 text-foreground/60">
        <p className="font-semibold text-foreground/80">Как использовать:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Добавьте файл верификации и нажмите «Сохранить»</li>
          <li>Скопируйте URL файла кнопкой «Скопировать URL»</li>
          <li>Вставьте этот URL в поле верификации нужного сервиса</li>
        </ol>
        <p className="text-xs text-foreground/40 pt-1">
          Поддерживаются все сервисы, которые проверяют домен через HTTP-запрос к файлу: Яндекс.Вебмастер, Google Search Console, Mail.ru и другие.
        </p>
      </div>
    </div>
  );
}
