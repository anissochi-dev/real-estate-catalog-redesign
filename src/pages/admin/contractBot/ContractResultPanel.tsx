import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { Session } from './types';

interface Props {
  current: Session;
  filling: boolean;
  downloading: string | null;
  onDownloadTxt: () => void;
  onDownloadFormat: (fmt: 'docx' | 'pdf') => void;
  onCopyText: () => void;
}

export default function ContractResultPanel({
  current, filling, downloading,
  onDownloadTxt, onDownloadFormat, onCopyText,
}: Props) {
  const [dlOpen, setDlOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendForm, setSendForm] = useState({ email: '', phone: '', message: '' });

  const openSend = () => {
    setSendForm({
      email: '',
      phone: '',
      message: `Добрый день!\n\nНаправляю вам договор «${current.title}».\n\nПожалуйста, ознакомьтесь и подпишите.`,
    });
    setSendOpen(true);
  };

  const sendByEmail = () => {
    if (!sendForm.email.trim()) { toast.error('Введите email'); return; }
    const subject = encodeURIComponent(`Договор: ${current.title}`);
    const body = encodeURIComponent(sendForm.message + (current.result_url ? `\n\nСсылка на файл: ${current.result_url}` : ''));
    window.open(`mailto:${sendForm.email}?subject=${subject}&body=${body}`, '_blank');
    toast.success('Открыт почтовый клиент');
    setSendOpen(false);
  };

  const sendByWhatsApp = () => {
    if (!sendForm.phone.trim()) { toast.error('Введите номер телефона'); return; }
    const phone = sendForm.phone.replace(/\D/g, '');
    const text = encodeURIComponent(sendForm.message + (current.result_url ? `\n\nСсылка на файл: ${current.result_url}` : ''));
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    toast.success('Открыт WhatsApp');
    setSendOpen(false);
  };

  const sendByTelegram = () => {
    const text = encodeURIComponent(sendForm.message + (current.result_url ? `\n\nСсылка на файл: ${current.result_url}` : ''));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(current.result_url || '')}&text=${text}`, '_blank');
    toast.success('Открыт Telegram');
    setSendOpen(false);
  };

  const copyFileLink = () => {
    if (!current.result_url) { toast.error('Сначала заполните договор'); return; }
    navigator.clipboard.writeText(current.result_url).then(() => toast.success('Ссылка скопирована'));
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="font-semibold text-sm">Результат</div>
          {current.filled_contract && (
            <div className="flex items-center gap-1.5">
              <button onClick={onCopyText}
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
                    <button onClick={() => { onDownloadTxt(); setDlOpen(false); }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left">
                      <Icon name="FileText" size={13} className="text-muted-foreground" /> Скачать .TXT
                    </button>
                    <button onClick={() => { onDownloadFormat('docx'); setDlOpen(false); }}
                      disabled={downloading === 'docx'}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left disabled:opacity-50">
                      {downloading === 'docx'
                        ? <Icon name="Loader2" size={13} className="animate-spin" />
                        : <Icon name="FileType" size={13} className="text-blue-600" />}
                      Скачать .DOCX
                    </button>
                    <button onClick={() => { onDownloadFormat('pdf'); setDlOpen(false); }}
                      disabled={downloading === 'pdf'}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left disabled:opacity-50">
                      {downloading === 'pdf'
                        ? <Icon name="Loader2" size={13} className="animate-spin" />
                        : <Icon name="FileType2" size={13} className="text-red-600" />}
                      Скачать .PDF
                    </button>
                    <div className="border-t border-border mt-2 pt-2">
                      <button onClick={() => { onCopyText(); setDlOpen(false); }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-sm w-full text-left">
                        <Icon name="Copy" size={13} /> Копировать текст
                      </button>
                      {current.result_url && (
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
          {current.filled_contract ? (
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

      {/* Модальное окно отправки */}
      {sendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display font-700 text-base">Отправить договор</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[260px]">{current.title}</div>
              </div>
              <button onClick={() => setSendOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition">
                <Icon name="X" size={16} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сообщение</label>
              <textarea
                value={sendForm.message}
                onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
              />
            </div>

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

            {current.result_url && (
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