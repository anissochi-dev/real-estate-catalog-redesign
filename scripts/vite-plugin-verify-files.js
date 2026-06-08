/**
 * Vite-плагин: при сборке тянет файлы верификации из БД и кладёт в public/.
 * Подключается в vite.config.ts.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

async function generateVerifyFiles() {
  let dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    const envPath = join(__dirname, '..', '.env');
    if (existsSync(envPath)) {
      const env = readFileSync(envPath, 'utf8');
      const match = env.match(/DATABASE_URL=([^\r\n]+)/);
      if (match) dbUrl = match[1].trim();
    }
  }
  if (!dbUrl) return;

  let pg;
  try { pg = (await import('pg')).default; } catch { return; }

  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT verification_files FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1"
    );
    await client.end();

    let files = (res.rows[0] || {}).verification_files || [];
    if (typeof files === 'string') { try { files = JSON.parse(files); } catch { files = []; } }
    if (!Array.isArray(files)) return;

    for (const vf of files) {
      const filename = (vf.filename || '').trim();
      const content = (vf.content || '').trim();
      if (!filename || !content) continue;
      writeFileSync(join(PUBLIC_DIR, filename), content, 'utf8');
      console.log(`[verify-files] ✓ public/${filename}`);
    }
  } catch (e) {
    console.log(`[verify-files] skip: ${e.message}`);
    try { await client.end(); } catch {}
  }
}

export default function verifyFilesPlugin() {
  return {
    name: 'vite-plugin-verify-files',
    async buildStart() {
      await generateVerifyFiles();
    },
  };
}
