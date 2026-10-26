import { useState } from 'react';
import { aiApi } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Listing } from './types';
import {
  buildListingContext, checkRequiredForAi, buildTagsContext, buildSeoContext,
  parseTags, parseSeoTitle, normalizeAiTitle,
} from './listingAiContext';

const SEO_BASE = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';

export function useListingAi(
  editing: Partial<Listing> | null,
  setEditing: (l: Partial<Listing> | null) => void,
) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTitleLoading, setAiTitleLoading] = useState(false);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const [aiSeoLoading, setAiSeoLoading] = useState(false);
  const [aiAllLoading, setAiAllLoading] = useState(false);
  const [aiImproveLoading, setAiImproveLoading] = useState(false);

  const aiDescribe = async () => {
    if (!editing) return;
    const err = checkRequiredForAi(editing);
    if (err) { alert(err); return; }
    setAiLoading(true);
    try {
      // Цену в описание НЕ передаём — по требованию её не должно быть в тексте
      const r = await aiApi.ask('describe', buildListingContext(editing, false));
      setEditing({ ...editing, description: (r.text || '').slice(0, 3000) });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiLoading(false);
    }
  };

  const aiTitle = async () => {
    if (!editing) return;
    const err = checkRequiredForAi(editing);
    if (err) { alert(err); return; }
    setAiTitleLoading(true);
    try {
      const r = await aiApi.ask('title', buildListingContext(editing, false));
      setEditing({ ...editing, title: normalizeAiTitle(r.text || '') });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiTitleLoading(false);
    }
  };

  const generateTags = async () => {
    if (!editing) return;
    setAiTagsLoading(true);
    try {
      const r = await aiApi.ask('auto_tags', buildTagsContext(editing, editing.description || ''));
      setEditing({ ...editing, tags: parseTags(r.text) });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAiTagsLoading(false);
    }
  };

  const generateSeo = async () => {
    if (!editing) return;
    setAiSeoLoading(true);
    try {
      const r = await aiApi.ask('seo_listing', buildSeoContext(editing, editing.description || ''));
      setEditing({ ...editing, seo_title: parseSeoTitle(r.text) });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAiSeoLoading(false);
    }
  };

  const generateAll = async () => {
    if (!editing) return;
    setAiAllLoading(true);
    try {
      const descRes = await aiApi.ask('describe', buildListingContext(editing, false));
      const description = (descRes.text || editing.description || '').slice(0, 3000);
      const tagsRes = await aiApi.ask('auto_tags', buildTagsContext(editing, description));
      const tags = parseTags(tagsRes.text);
      const seoRes = await aiApi.ask('seo_listing', buildSeoContext(editing, description));
      const seo_title = parseSeoTitle(seoRes.text);
      setEditing({ ...editing, description, tags, seo_title });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiAllLoading(false);
    }
  };

  const improveWithAi = async (fields: string[]) => {
    if (!editing?.id) return;
    setAiImproveLoading(true);
    try {
      let tok = '';
      try { tok = localStorage.getItem('biznest_token') || ''; } catch { /* ignore */ }
      const url = tok ? `${SEO_BASE}?auth_token=${encodeURIComponent(tok)}` : SEO_BASE;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { 'X-Auth-Token': tok } : {}) },
        // dry_run: true — ИИ только генерирует текст и возвращает его в ответе,
        // но НЕ пишет в базу данных. Результат подставляется в форму, а фактически
        // сохраняется только по нажатию «Сохранить», как и все остальные поля формы.
        body: JSON.stringify({ action: 'improve_listing', listing_id: editing.id, fields, auth_token: tok, dry_run: true }),
      });
      const data = await r.json();
      if (data.error) { toast.error(data.error); return; }
      const patch: Partial<Listing> = {};
      if (data.seo_title) patch.seo_title = data.seo_title;
      if (data.seo_description) patch.seo_description = data.seo_description;
      if (data.faq) patch.faq = data.faq;
      setEditing({ ...editing, ...patch });
      toast.success(`ИИ улучшил: ${fields.join(', ')}. Не забудьте нажать «Сохранить»`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка ИИ');
    } finally {
      setAiImproveLoading(false);
    }
  };

  return {
    aiLoading, aiTitleLoading, aiTagsLoading, aiSeoLoading, aiAllLoading, aiImproveLoading,
    setAiAllLoading,
    aiDescribe, aiTitle, generateTags, generateSeo, generateAll, improveWithAi,
  };
}
