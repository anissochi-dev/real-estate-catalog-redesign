import React from 'react';

const SECTION_HEADERS = [
  'От собственника',
  'Общие параметры и назначение',
  'Локация и район',
  'Характеристики объекта',
  'Коммуникации',
  'Финансовые перспективы и доходность',
  'Условия и юридическая чистота',
  'Призыв к действию',
];

function normalizeHeader(line: string): string | null {
  const clean = line.trim().replace(/[*#:]+$/, '').trim();
  for (const h of SECTION_HEADERS) {
    if (clean.toLowerCase() === h.toLowerCase()) return h;
  }
  // Матч по вхождению — на случай если ИИ добавил доп. слова
  for (const h of SECTION_HEADERS) {
    if (clean.toLowerCase().includes(h.toLowerCase()) && clean.length < h.length + 10) return h;
  }
  return null;
}

interface Section {
  header: string | null;
  lines: string[];
}

function parseDescription(text: string): Section[] {
  const rawLines = text.split('\n');
  const sections: Section[] = [];
  let current: Section = { header: null, lines: [] };

  for (const raw of rawLines) {
    const header = normalizeHeader(raw);
    if (header) {
      if (current.lines.some(l => l.trim())) sections.push(current);
      current = { header, lines: [] };
    } else {
      current.lines.push(raw);
    }
  }
  if (current.lines.some(l => l.trim())) sections.push(current);

  return sections;
}

interface Props {
  text: string;
  className?: string;
}

const HEADER_ICONS: Record<string, string> = {
  'Общие параметры и назначение': '🏢',
  'Локация и район': '📍',
  'Характеристики объекта': '📐',
  'Коммуникации': '⚡',
  'Финансовые перспективы и доходность': '📈',
  'Условия и юридическая чистота': '✅',
  'Призыв к действию': '📞',
};

export default function DescriptionRenderer({ text, className = '' }: Props) {
  const sections = parseDescription(text);

  return (
    <div className={`space-y-4 text-sm leading-relaxed text-foreground/80 ${className}`}>
      {sections.filter(s => s.header !== 'Призыв к действию').map((section, i) => (
        <div key={i}>
          {section.header && section.header !== 'От собственника' && (
            <div className="flex items-center gap-2 mb-1.5 mt-2">
              {HEADER_ICONS[section.header] && (
                <span className="text-base">{HEADER_ICONS[section.header]}</span>
              )}
              <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                {section.header}
              </span>
            </div>
          )}
          {section.header === 'От собственника' && (
            <div className="inline-flex items-center gap-1.5 bg-brand-orange/10 text-brand-orange text-xs font-semibold px-3 py-1 rounded-full mb-1">
              ✦ {section.lines.filter(l => l.trim()).join(' ') || 'От собственника! Без комиссий и %'}
            </div>
          )}
          {section.header !== 'От собственника' && (
            <div className="space-y-1">
              {section.lines.map((line, j) =>
                line.trim() ? (
                  <p key={j}>{line}</p>
                ) : (
                  <div key={j} className="h-1" />
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}