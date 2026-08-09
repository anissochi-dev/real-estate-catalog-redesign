import { useMemo } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { getSiteUrl } from '@/lib/siteUrl';
import { makeBreadcrumbSchema } from '@/components/SchemaOrg';
import type { Crumb } from '@/components/Breadcrumbs';

/**
 * Единая точка правды для хлебных крошек: из одного списка {label, to} строит
 * одновременно массив для визуального компонента <Breadcrumbs> и готовую
 * JSON-LD схему BreadcrumbList (Schema.org) — визуальные крошки и SEO-разметка
 * берутся из одного источника и больше не могут разойтись.
 *
 * Правила формирования JSON-LD (по рекомендациям Яндекса):
 * - элемент "Главная" (to === '/') исключается из схемы, но остаётся в визуальных крошках;
 * - все url в схеме — абсолютные (домен из настроек сайта, siteUrl);
 * - у последнего элемента url можно не указывать — просто не передавайте `to`.
 *
 * Визуальный компонент <Breadcrumbs> сам не делает последний элемент ссылкой,
 * поэтому `to` можно смело указывать даже у последнего пункта — на экране
 * ничего не изменится, а в JSON-LD появится корректный self-url.
 */
export function useBreadcrumbs(items: Crumb[]) {
  const { settings } = useSettings();
  const siteUrl = getSiteUrl(settings.site_url);

  const schema = useMemo(() => makeBreadcrumbSchema(
    items
      .filter(c => c.to !== '/')
      .map(c => ({ name: c.label, url: c.to ? `${siteUrl}${c.to}` : undefined })),
  ), [items, siteUrl]);

  return { items, schema };
}
