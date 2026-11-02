import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

// Сжатие ответов сервера: страницы, sitemap, robots.txt, данные server-функций.
// Brotli — для браузеров, которые его понимают (сильнее gzip на 15–20%), gzip — для остальных
// и для роботов поисковиков. Картинки/видео/архивы не трогаем: они уже сжаты.

const startFetch = createStartHandler(defaultStreamHandler);

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|rss\+xml|atom\+xml|ld\+json|manifest\+json|x-tss-framed|x-ndjson)|image\/svg\+xml)/i;
const MIN_BYTES = 1024;

function pickEncoding(accept: string): 'br' | 'gzip' | null {
  const a = accept.toLowerCase();
  if (/\bbr\b/.test(a)) return 'br';
  if (/\bgzip\b/.test(a)) return 'gzip';
  return null;
}

function compress(res: Response, encoding: 'br' | 'gzip'): Response {
  const source = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  const encoder = encoding === 'br'
    ? zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        },
        flush: zlib.constants.BROTLI_OPERATION_FLUSH,
      })
    : zlib.createGzip({ level: 6, flush: zlib.constants.Z_SYNC_FLUSH });
  const body = Readable.toWeb(source.pipe(encoder)) as unknown as ReadableStream<Uint8Array>;
  const headers = new Headers(res.headers);
  headers.set('Content-Encoding', encoding);
  headers.delete('Content-Length');
  const vary = headers.get('Vary');
  if (!vary) headers.set('Vary', 'Accept-Encoding');
  else if (!/accept-encoding/i.test(vary)) headers.set('Vary', `${vary}, Accept-Encoding`);
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

export default createServerEntry({
  async fetch(request, opts) {
    const res = await startFetch(request, opts);
    try {
      if (request.method === 'HEAD' || !res.body) return res;
      if (res.status < 200 || res.status === 204 || res.status === 206 || res.status === 304) return res;
      if (res.headers.has('Content-Encoding')) return res;
      const type = res.headers.get('Content-Type') || '';
      if (!COMPRESSIBLE.test(type) || /text\/event-stream/i.test(type)) return res;
      const len = Number(res.headers.get('Content-Length') || '0');
      if (len && len < MIN_BYTES) return res;
      const encoding = pickEncoding(request.headers.get('Accept-Encoding') || '');
      if (!encoding) return res;
      return compress(res, encoding);
    } catch {
      return res;
    }
  },
});
