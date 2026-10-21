import type { Property } from '@/app/appTypes';

type Kind = 'price' | 'area' | 'land' | 'ppm';
interface Criterion { kind: Kind; op: 'eq' | 'gte' | 'lte'; value: number }
interface ParsedQuery { criteria: Criterion[]; words: string[]; anyNumber: number | null }

const MULT: [string, number][] = [
  ['млрд', 1e9], ['миллион', 1e6], ['млн', 1e6], ['кк', 1e6], ['kk', 1e6],
  ['тыс', 1e3], ['т', 1e3], ['к', 1e3], ['k', 1e3],
];

const NUM_RE = new RegExp(
  '(?<![\\p{L}\\d.,])' +
  '(?:(от|до|>=|<=|>|<)\\s*)?' +
  '(\\d+(?:[ \\u00a0]\\d{3})*(?:[.,]\\d+)?)\\s*' +
  '(млрд|млн|миллион\\p{L}*|тыс\\p{L}*|кк|kk|т|к|k)?\\.?\\s*' +
  '((?:/|за)\\s*(?:м2|м²|кв\\.?\\s*м|квм|метр\\p{L}*|м)|м2|м²|кв\\.?\\s*м|квм|метр\\p{L}*|м|сот\\p{L}*|руб\\p{L}*|р|₽)?' +
  '\\.?(?![\\p{L}\\d²])',
  'gu',
);

export const normalizeText = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function parseSearchQuery(raw: string): ParsedQuery {
  const s = normalizeText(raw.trim());
  const criteria: Criterion[] = [];
  if (!s) return { criteria, words: [], anyNumber: null };

  if (/^[\d\s\u00a0]+$/.test(s)) {
    return { criteria, words: [], anyNumber: Number(s.replace(/\D/g, '')) };
  }

  const rest = s.replace(NUM_RE, (full, op, num, mult, unit) => {
    let v = Number(String(num).replace(/[ \u00a0]/g, '').replace(',', '.'));
    if (!Number.isFinite(v)) return full;
    if (mult) {
      const m = MULT.find(([k]) => String(mult).startsWith(k));
      if (m) v *= m[1];
    }
    const u = String(unit || '').replace(/\s/g, '');
    let kind: Kind | null = null;
    if (u.startsWith('/') || u.startsWith('за')) kind = 'ppm';
    else if (u.startsWith('сот')) kind = 'land';
    else if (u && (u.startsWith('м') || u.startsWith('кв'))) kind = 'area';
    else if (u || mult || op) kind = 'price';
    if (!kind) return full;
    const o = op === 'от' || op === '>' || op === '>=' ? 'gte' : op === 'до' || op === '<' || op === '<=' ? 'lte' : 'eq';
    criteria.push({ kind, op: o, value: v });
    return ' ';
  });

  const words = (rest.match(/[0-9a-zа-я]+/g) || []).filter(w => w.length >= 2 || /^\d+$/.test(w));
  return { criteria, words, anyNumber: null };
}

const pricePerM2 = (p: Property) =>
  p.pricePerM2 && p.pricePerM2 > 0 ? p.pricePerM2 : p.area > 0 ? p.price / p.area : 0;

function valueOf(p: Property, kind: Kind): number {
  if (kind === 'area') return p.area || 0;
  if (kind === 'land') return p.landArea || 0;
  if (kind === 'ppm') return pricePerM2(p);
  return p.price || 0;
}

function check(p: Property, c: Criterion): boolean {
  const v = valueOf(p, c.kind);
  if (!v) return false;
  if (c.op === 'gte') return v >= c.value;
  if (c.op === 'lte') return v <= c.value;
  if (c.kind === 'price') return v === c.value;
  if (c.kind === 'ppm') return Math.abs(v - c.value) <= c.value * 0.01;
  return Math.floor(v) === Math.floor(c.value);
}

const haystack = (p: Property) =>
  normalizeText([p.title, p.address, p.district, p.purpose, p.tenantName, p.publicCode].filter(Boolean).join(' '));

export function matchesSearch(p: Property, parsed: ParsedQuery): boolean {
  if (parsed.anyNumber !== null) {
    const n = parsed.anyNumber;
    return (
      p.id === n || p.publicCode === n || p.price === n ||
      Math.floor(p.area || 0) === n || Math.round(pricePerM2(p)) === n ||
      haystack(p).includes(String(n))
    );
  }
  if (!parsed.criteria.every(c => check(p, c))) return false;
  if (!parsed.words.length) return true;
  const h = haystack(p);
  return parsed.words.every(w => h.includes(w));
}

export function filterBySearch<T extends Property>(items: T[], query: string): T[] {
  const parsed = parseSearchQuery(query);
  if (parsed.anyNumber === null && !parsed.criteria.length && !parsed.words.length) return items;
  return items.filter(p => matchesSearch(p, parsed));
}
