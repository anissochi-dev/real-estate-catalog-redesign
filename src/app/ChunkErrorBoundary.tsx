import { Component } from 'react';
import type { ReactNode } from 'react';

export default class ChunkErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { error: boolean }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) { super(props); this.state = { error: false }; }
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) {
    const msg = String(error?.message || error || '');
    if (/Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(msg)) {
      try {
        const last = Number(sessionStorage.getItem('__chunk_reload_at__') || '0');
        if (Date.now() - last > 15000) {
          sessionStorage.setItem('__chunk_reload_at__', String(Date.now()));
          if ('caches' in window) caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload());
          else window.location.reload();
        }
      } catch { window.location.reload(); }
    }
  }
  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4 text-center p-8">
          <div className="text-4xl">⚠️</div>
          <div className="font-semibold text-lg">Не удалось загрузить страницу</div>
          <div className="text-sm text-muted-foreground max-w-md">Возможно, кеш браузера устарел после обновления сайта.</div>
          <button className="px-4 py-2 bg-brand-blue text-white rounded-xl" onClick={() => {
            try { sessionStorage.removeItem('__chunk_reload_at__'); } catch { /* ignore */ }
            window.location.reload();
          }}>Обновить страницу</button>
        </div>
      );
    }
    return this.props.children;
  }
}
