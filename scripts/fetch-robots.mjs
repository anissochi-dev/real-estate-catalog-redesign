/**
 * Fetches the live robots.txt from the backend and writes it to public/robots.txt.
 * Run via: node scripts/fetch-robots.mjs
 * Wired into the same build pipeline step as fetch-sitemap.mjs.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'robots.txt');

const ROBOTS_URL =
  'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=robots_txt';

async function fetchRobots() {
  console.log(`Fetching robots.txt from: ${ROBOTS_URL}`);

  const res = await fetch(ROBOTS_URL, {
    headers: { Accept: 'text/plain, */*' },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  if (!text.includes('User-agent')) {
    throw new Error('Response does not look like a valid robots.txt');
  }

  writeFileSync(OUTPUT_PATH, text, 'utf-8');

  console.log(`robots.txt written to public/robots.txt (${text.length} bytes)`);
}

fetchRobots().catch((err) => {
  console.error('Failed to fetch robots.txt:', err.message);
  process.exit(1);
});
