import { useState, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

const STT_URL = 'https://functions.poehali.dev/0600dfc2-44ac-4c03-be62-771c9e9183e4';

export interface VoiceFields {
  title?: string;
  category?: string;
  deal?: string;
  area?: number;
  price?: number;
  price_unit?: string;
  floor?: number;
  floors_total?: number;
  ceiling_height?: number;
  address?: string;
  district?: string;
  condition?: string;
  description?: string;
  parking?: boolean;
  separate_entrance?: boolean;
}

interface Props {
  onText?: (text: string) => void;
  onFields?: (fields: VoiceFields, text: string) => void;
  mode?: 'stt' | 'parse';
  className?: string;
  size?: 'sm' | 'md';
}

type State = 'idle' | 'recording' | 'processing' | 'done' | 'error';

const MAX_RECORD_SEC = 60;

export default function VoiceInputButton({ onText, onFields, mode = 'parse', className = '', size = 'md' }: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [recSec, setRecSec] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    mediaRef.current?.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg('');
    setRecSec(0);
    setState('recording');
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('error');
      setErrorMsg('Нет доступа к микрофону. Разрешите в настройках браузера.');
      return;
    }

    // Выбираем поддерживаемый формат
    const fmtPref = [
      { mime: 'audio/ogg;codecs=opus', fmt: 'ogg_opus' },
      { mime: 'audio/webm;codecs=opus', fmt: 'webm' },
      { mime: 'audio/webm', fmt: 'webm' },
      { mime: 'audio/mp4', fmt: 'mp3' },
    ];
    const chosen = fmtPref.find(f => MediaRecorder.isTypeSupported(f.mime)) || fmtPref[1];

    const mr = new MediaRecorder(stream, { mimeType: chosen.mime });
    mediaRef.current = mr;

    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      setState('processing');

      const blob = new Blob(chunksRef.current, { type: chosen.mime });
      const ab = await blob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));

      try {
        const res = await fetch(STT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_b64: b64, format: chosen.fmt, mode }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Ошибка');

        setState('done');
        setTimeout(() => setState('idle'), 2500);

        if (mode === 'stt') {
          onText?.(data.text || '');
        } else {
          onFields?.(data.fields || {}, data.text || '');
          onText?.(data.text || '');
        }
      } catch (e: unknown) {
        setState('error');
        setErrorMsg(e instanceof Error ? e.message : 'Ошибка распознавания');
        setTimeout(() => setState('idle'), 4000);
      }
    };

    mr.start(200);

    // Таймер секунд
    timerRef.current = setInterval(() => setRecSec(s => s + 1), 1000);
    // Автостоп
    autoStopRef.current = setTimeout(() => stopRecording(), MAX_RECORD_SEC * 1000);
  }, [mode, onText, onFields, stopRecording]);

  const handleClick = () => {
    if (state === 'recording') stopRecording();
    else if (state === 'idle' || state === 'error') startRecording();
  };

  const isSmall = size === 'sm';
  const btnSize = isSmall ? 'w-7 h-7' : 'w-8 h-8';
  const iconSize = isSmall ? 13 : 15;

  // Цвет и иконка по состоянию
  const stateConfig: Record<State, { icon: string; cls: string; title: string }> = {
    idle:       { icon: 'Mic',       cls: 'bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground',          title: 'Голосовой ввод' },
    recording:  { icon: 'MicOff',    cls: 'bg-red-500 hover:bg-red-600 text-white animate-pulse',                            title: `Запись ${recSec}с — нажмите чтобы остановить` },
    processing: { icon: 'Loader2',   cls: 'bg-violet-100 text-violet-600 cursor-wait',                                       title: 'Распознаю речь…' },
    done:       { icon: 'Check',     cls: 'bg-emerald-100 text-emerald-600',                                                 title: 'Готово!' },
    error:      { icon: 'MicOff',    cls: 'bg-red-100 text-red-500',                                                        title: errorMsg || 'Ошибка' },
  };

  const cfg = stateConfig[state];

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'processing'}
        title={cfg.title}
        className={`
          ${btnSize} rounded-lg flex items-center justify-center
          transition-all duration-150 flex-shrink-0
          ${cfg.cls} ${className}
        `}
      >
        <Icon
          name={cfg.icon}
          size={iconSize}
          className={state === 'processing' ? 'animate-spin' : ''}
        />
      </button>

      {/* Индикатор времени записи */}
      {state === 'recording' && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-red-500 whitespace-nowrap bg-white px-1 rounded shadow-sm">
          {recSec}с
        </span>
      )}

      {/* Тултип ошибки */}
      {state === 'error' && errorMsg && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-red-600 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap shadow-lg z-50 max-w-[220px] text-center">
          {errorMsg}
        </div>
      )}
    </div>
  );
}