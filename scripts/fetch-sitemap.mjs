/**
 * Fetches the live sitemap XML from the backend and writes it to public/sitemap.xml.
 * Run via: node scripts/fetch-sitemap.mjs
 * Wired into package.json as part of the build pipeline.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'sitemap.xml');

const SITEMAP_URL =
  'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=sitemap_xml';

async function fetchSitemap() {
  console.log(`Fetching sitemap from: ${SITEMAP_URL}`);

  const res = await fetch(SITEMAP_URL, {
    headers: { Accept: 'application/xml, text/xml, */*' },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();

  if (!xml.includes('<urlset')) {
    throw new Error('Response does not look like a valid sitemap XML');
  }

  writeFileSync(OUTPUT_PATH, xml, 'utf-8');

  const urlCount = (xml.match(/<url>/g) || []).length;
  console.log(`Sitemap written to public/sitemap.xml (${urlCount} URLs, ${xml.length} bytes)`);
}

fetchSitemap().catch((err) => {
  console.error('Failed to fetch sitemap:', err.message);
  process.exit(1);
});
