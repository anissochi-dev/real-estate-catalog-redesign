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

// Транслитерация — у jsPDF дефолтный шрифт не поддерживает кириллицу.
// Чтобы PDF был читаемым без подгрузки тяжёлых шрифтов — используем латиницу.
const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  '₽': 'RUB', '№': 'No', '—': '-', '–': '-', '«': '"', '»': '"', '·': '-',
};

function tr(s: string): string {
  return s.split('').map(ch => {
    const lower = ch.toLowerCase();
    const mapped = MAP[lower];
    if (mapped === undefined) return ch;
    if (ch === lower) return mapped;
    return mapped ? mapped[0].toUpperCase() + mapped.slice(1) : mapped;
  }).join('');
}

export function saveCalcAsPdf(payload: SaveCalcPayload): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 15;
  const left = 15;
  const right = W - 15;

  // Header
  doc.setFillColor(15, 82, 186); // brand-blue
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(tr(payload.companyName || 'BIZNEST'), left, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(tr('Finansoviy raschyot / Financial calculation'), left, 21);
  y = 38;

  // Calculation title
  doc.setTextColor(15, 82, 186);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(tr(payload.calcTitle), left, y);
  y += 8;

  // Property block
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const propLines = [
    `Obyekt: ${tr(payload.propertyTitle)}`,
    payload.propertyAddress ? `Adres: ${tr(payload.propertyAddress)}` : '',
    payload.propertyPrice ? `Tsena: ${payload.propertyPrice.toLocaleString('ru').replace(/\s/g, ' ')} RUB` : '',
    `Data: ${new Date().toLocaleString('ru')}`,
  ].filter(Boolean);
  propLines.forEach(line => {
    doc.text(line, left, y);
    y += 5;
  });
  y += 4;

  const drawSection = (title: string, rows: CalcRow[]) => {
    doc.setFillColor(240, 245, 252);
    doc.rect(left, y - 4, right - left, 8, 'F');
    doc.setTextColor(15, 82, 186);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(tr(title), left + 2, y + 1);
    y += 8;

    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    rows.forEach(row => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(tr(row.label), left + 2, y);
      doc.setFont('helvetica', 'bold');
      doc.text(tr(row.value), right - 2, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 5;
      if (row.hint) {
        doc.setTextColor(140, 140, 140);
        doc.setFontSize(8);
        doc.text(tr(row.hint), left + 4, y);
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        y += 4;
      }
      // separator
      doc.setDrawColor(230, 230, 230);
      doc.line(left, y - 1, right, y - 1);
      y += 2;
    });
    y += 4;
  };

  drawSection('Vhodnye dannye / Inputs', payload.inputs);
  drawSection('Rezultat / Results', payload.results);

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      tr(`${payload.companyName || 'BIZNEST'}${payload.companyPhone ? ' · ' + payload.companyPhone : ''}`),
      left,
      290,
    );
    doc.text(`${i} / ${pageCount}`, right, 290, { align: 'right' });
  }

  const safeName = tr(`${payload.calcTitle}-${payload.propertyTitle}`)
    .replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-').slice(0, 60);
  doc.save(`${safeName || 'calculation'}.pdf`);
}
