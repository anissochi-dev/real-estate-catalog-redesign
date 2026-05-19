import { jsPDF } from 'jspdf';

export interface CalcRow {
  label: string;
  value: string;
  hint?: string;
}

export interface SaveCalcPayload {
  calcTitle: string;
  propertyTitle: string;
  propertyAddress?: string;
  propertyPrice?: number;
  inputs: CalcRow[];
  results: CalcRow[];
  companyName?: string;
  companyPhone?: string;
}

// Транслитерация кириллицы → латиница для jsPDF
const CYR: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  '₽':'RUB','№':'No','—':'-','–':'-','«':'"','»':'"','·':'-','…':'...',
};

function ru(s: string): string {
  return s.split('').map(ch => {
    const lo = ch.toLowerCase();
    const m = CYR[lo];
    if (m === undefined) return ch;
    if (!m) return '';
    return ch === lo ? m : m[0].toUpperCase() + m.slice(1);
  }).join('');
}

// Словарь «правильных» латинских эквивалентов для ключевых терминов
const TERMS: Record<string, string> = {
  'Финансовый расчет': 'Financial Report',
  'Финансовый расчёт': 'Financial Report',
  'Исходные данные': 'Input Data',
  'Результаты расчёта': 'Results',
  'Результаты расчета': 'Results',
  'Адрес': 'Address',
  'Цена': 'Price',
  'Дата формирования': 'Date',
  'Страница': 'Page',
  'из': 'of',
  'Площадь': 'Area',
  'Объект': 'Object',
};

function t(s: string): string {
  if (TERMS[s]) return TERMS[s];
  return ru(s);
}

function tLine(s: string): string {
  // Ищем целые слова из словаря
  let result = s;
  for (const [key, val] of Object.entries(TERMS)) {
    result = result.replace(new RegExp(key, 'g'), val);
  }
  // Оставшуюся кириллицу транслитерируем
  return ru(result);
}

export function saveCalcAsPdf(payload: SaveCalcPayload): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 15;
  const left = 15;
  const right = W - 15;

  // ── Шапка ──────────────────────────────────────────────────
  doc.setFillColor(15, 82, 186);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(tLine(payload.companyName || 'BIZNEST'), left, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Financial Report / Finansoviy Raschet', left, 22);
  if (payload.companyPhone) {
    doc.text(tLine(payload.companyPhone), right, 22, { align: 'right' });
  }
  y = 40;

  // ── Заголовок расчёта ───────────────────────────────────────
  doc.setTextColor(15, 82, 186);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(tLine(payload.calcTitle), left, y);
  y += 10;

  // ── Блок объекта ────────────────────────────────────────────
  const infoLines: string[] = [
    `Object: ${tLine(payload.propertyTitle)}`,
    payload.propertyAddress ? `Address: ${tLine(payload.propertyAddress)}` : '',
    payload.propertyPrice
      ? `Price: ${payload.propertyPrice.toLocaleString('en').replace(/,/g, ' ')} RUB`
      : '',
    `Date: ${new Date().toLocaleDateString('en-GB')}`,
  ].filter(Boolean);

  doc.setFillColor(245, 247, 252);
  doc.rect(left, y - 5, right - left, infoLines.length * 5 + 8, 'F');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  infoLines.forEach(line => {
    doc.text(line, left + 3, y);
    y += 5;
  });
  y += 6;

  // ── Секции ──────────────────────────────────────────────────
  const drawSection = (title: string, rows: CalcRow[], color: [number, number, number]) => {
    if (!rows.length) return;

    doc.setFillColor(...color);
    doc.rect(left, y - 4, right - left, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(t(title), left + 3, y + 2);
    y += 10;

    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    rows.forEach((row, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 253);
        doc.rect(left, y - 4, right - left, 7, 'F');
      }

      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal');
      doc.text(tLine(row.label), left + 3, y);

      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(tLine(row.value), right - 3, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 7;

      if (row.hint) {
        doc.setTextColor(130, 130, 130);
        doc.setFontSize(8);
        doc.text(tLine(row.hint), left + 5, y);
        doc.setFontSize(10);
        y += 4;
      }
    });
    y += 6;
  };

  drawSection('Исходные данные', payload.inputs, [15, 82, 186]);
  drawSection('Результаты расчёта', payload.results, [5, 150, 105]);

  // ── Нумерация страниц ───────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220);
    doc.line(left, 284, right, 284);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    const footer = tLine(
      `${payload.companyName || 'BIZNEST'}${payload.companyPhone ? ' · ' + payload.companyPhone : ''}`
    );
    doc.text(footer, left, 289);
    doc.text(`Page ${i} of ${pageCount}`, right, 289, { align: 'right' });
  }

  const safeName = tLine(payload.calcTitle + '-' + payload.propertyTitle)
    .replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-').slice(0, 60);
  doc.save(`${safeName || 'calculation'}.pdf`);
}
