import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import { SEO_BASE } from '@/pages/admin/seo/seoTypes';

interface RemoteSeo {
  path: string;
  title?: string | null;
  description?: string | null;
  h1?: string | null;
  keywords?: string | null;
  og_image?: string | null;
  noindex?: boolean | null;
}

interface SeoHeadProps {
  /** Явный путь (если не задан — берётся из react-router location.pathname). */
  path?: string;
  /** Жёстко заданный title — перебивает значение из БД. */
  title?: string;
  /** Жёстко заданное описание — перебивает БД. */
  description?: string;
  /** Жёсткий H1 (используется как title fallback). */
  h1?: string;
  /** Принудительно noindex (для админки, логина, личных страниц). */
  noindex?: boolean;
  /** Дополнительные ключевые слова. */
  keywords?: string;
  /** OG-изображение. */
  ogImage?: string;
}

const cache = new Map<string, RemoteSeo | null>();
const inflight = new Map<string, Promise<RemoteSeo | null>>();

async function fetchPageSeo(path: string): Promise<RemoteSeo | null> {
  if (cache.has(path)) return cache.get(path) || null;
  if (inflight.has(path)) return inflight.get(path)!;
  const p = (async () => {
    try {
      const r = await fetch(SEO_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_page_seo', path }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      const page: RemoteSeo | null = d?.page || null;
      cache.set(path, page);
      return page;
    } catch {
      cache.set(path, null);
      return null;
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, p);
  return p;
}

function setMeta(name: string, content: string | null | undefined, useProperty = false) {
  const attr = useProperty ? 'property' : 'name';
  const head = document.head;
  let tag = head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!content) {
    if (tag) tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setLinkCanonical(href: string) {
  const head = document.head;
  let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export default function SeoHead({
  path, title, description, h1, noindex, keywords, ogImage,
}: SeoHeadProps) {
  const location = useLocation();
  const { settings } = useSettings();
  const siteOrigin = (settings.site_url || '').replace(/\/$/, '');
  const effectivePath = path || location.pathname || '/';
  const [remote, setRemote] = useState<RemoteSeo | null>(() => cache.get(effectivePath) || null);

  useEffect(() => {
    let alive = true;
    fetchPageSeo(effectivePath).then(r => {
      if (alive) setRemote(r);
    });
    return () => { alive = false; };
  }, [effectivePath]);

  useEffect(() => {
    // SEO-лимиты: title ≤ 68 символов, meta description ≤ 160 символов
    const clip = (s: string, max: number) => (s && s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
    const rawTitle = title || remote?.title || h1 || remote?.h1 || document.title;
    const finalTitle = clip(String(rawTitle || ''), 68);
    const finalDesc = clip(description ?? remote?.description ?? '', 160);
    const finalKw = keywords ?? remote?.keywords ?? '';
    const finalOg = ogImage ?? remote?.og_image ?? '';
    const finalNoindex = noindex || !!remote?.noindex;

    if (finalTitle) document.title = String(finalTitle);
    setMeta('description', finalDesc || null);
    setMeta('keywords', finalKw || null);

    // Open Graph
    setMeta('og:title', finalTitle ? String(finalTitle) : null, true);
    setMeta('og:description', finalDesc || null, true);
    if (finalOg) setMeta('og:image', finalOg, true);
    setMeta('og:type', 'website', true);
    setMeta('og:url', (siteOrigin || window.location.origin) + effectivePath, true);

    // Twitter
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', finalTitle ? String(finalTitle) : null);
    setMeta('twitter:description', finalDesc || null);
    if (finalOg) setMeta('twitter:image', finalOg);

    // robots
    setMeta('robots', finalNoindex ? 'noindex, nofollow' : 'index, follow');

    // canonical (без query)
    setLinkCanonical((siteOrigin || window.location.origin) + effectivePath);
  }, [
    effectivePath, remote, title, description, h1, noindex, keywords, ogImage, siteOrigin,
  ]);

  return null;
}

/** Хелпер: возвращает H1 для страницы из БД (если задан админом), иначе fallback. */
export function useSeoH1(fallback: string, path?: string): string {
  const location = useLocation();
  const effectivePath = path || location.pathname || '/';
  const [h1, setH1] = useState<string>(() => {
    const c = cache.get(effectivePath);
    return c?.h1 || fallback;
  });
  useEffect(() => {
    let alive = true;
    fetchPageSeo(effectivePath).then(r => {
      if (alive && r?.h1) setH1(r.h1);
    });
    return () => { alive = false; };
  }, [effectivePath, fallback]);
  return h1;
}