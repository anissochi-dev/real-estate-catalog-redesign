import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITEMAP_URL = 'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=sitemap_xml';
const OUT_PATH = resolve(__dirname, '../public/sitemap.xml');

async function main() {
  console.log('Generating sitemap.xml...');
  try {
    const res = await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!xml.includes('<urlset')) throw new Error('Response is not valid sitemap XML');
    writeFileSync(OUT_PATH, xml, 'utf-8');
    const count = (xml.match(/<url>/g) || []).length;
    console.log(`sitemap.xml generated: ${count} URLs`);
  } catch (err) {
    console.warn(`Warning: sitemap generation failed (${err.message}). Using existing file.`);
    process.exit(0);
  }
}

main();
