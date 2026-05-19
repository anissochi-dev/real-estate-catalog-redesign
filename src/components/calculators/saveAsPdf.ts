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

// Загружаем шрифт с поддержкой кириллицы через Google Fonts (TTF → base64)
let fontB64: string | null = null;
let fontBoldB64: string | null = null;

async function loadFont(url: string): Promise<string> {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function ensureFonts() {
  if (fontB64 && fontBoldB64) return;
  try {
    [fontB64, fontBoldB64] = await Promise.all([
      loadFont('https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2').catch(() =>
        loadFont('https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.8/files/roboto-latin-400-normal.woff2')
      ),
      loadFont('https://fonts.gstatic.com/s/roboto/v32/KFOlCnqEu92Fr1MmWUlfBBc4AMP6lQ.woff2').catch(() =>
        loadFont('https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.8/files/roboto-latin-700-normal.woff2')
      ),
    ]);
  } catch {
    // шрифт не загрузился — будет транслитерация
    fontB64 = '';
    fontBoldB64 = '';
  }
}

// Транслитерация — фолбэк если шрифт не загрузился
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

function setupDoc(doc: jsPDF, hasFont: boolean) {
  if (hasFont && fontB64 && fontBoldB64) {
    try {
      doc.addFileToVFS('Roboto-normal.woff2', fontB64);
      doc.addFont('Roboto-normal.woff2', 'Roboto', 'normal');
      doc.addFileToVFS('Roboto-bold.woff2', fontBoldB64);
      doc.addFont('Roboto-bold.woff2', 'Roboto', 'bold');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function t(s: string, cyrillicOk: boolean): string {
  return cyrillicOk ? s : tr(s);
}

export async function saveCalcAsPdf(payload: SaveCalcPayload): Promise<void> {
  await ensureFonts();

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cyrillicOk = setupDoc(doc, true);
  const font = cyrillicOk ? 'Roboto' : 'helvetica';

  const W = 210;
  let y = 15;
  const left = 15;
  const right = W - 15;

  // Шапка
  doc.setFillColor(15, 82, 186);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(font, 'bold');
  doc.setFontSize(18);
  doc.text(t(payload.companyName || 'BIZNEST', cyrillicOk), left, 14);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.text(t('Финансовый расчёт', cyrillicOk), left, 22);
  if (payload.companyPhone) {
    doc.text(t(payload.companyPhone, cyrillicOk), right, 22, { align: 'right' });
  }
  y = 40;

  // Заголовок расчёта
  doc.setTextColor(15, 82, 186);
  doc.setFont(font, 'bold');
  doc.setFontSize(15);
  doc.text(t(payload.calcTitle, cyrillicOk), left, y);
  y += 10;

  // Информация об объекте
  doc.setFillColor(245, 247, 252);
  doc.rect(left, y - 5, right - left, (payload.propertyAddress ? 20 : 15), 'F');
  doc.setTextColor(40, 40, 40);
  doc.setFont(font, 'bold');
  doc.setFontSize(11);
  doc.text(t(payload.propertyTitle, cyrillicOk), left + 3, y);
  y += 6;
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  if (payload.propertyAddress) {
    doc.text(t(`Адрес: ${payload.propertyAddress}`, cyrillicOk), left + 3, y);
    y += 5;
  }
  if (payload.propertyPrice) {
    doc.text(
      t(`Цена: ${payload.propertyPrice.toLocaleString('ru')} ₽`, cyrillicOk),
      left + 3, y
    );
    y += 5;
  }
  doc.text(
    t(`Дата формирования: ${new Date().toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' })}`, cyrillicOk),
    left + 3, y
  );
  y += 10;

  const drawSection = (title: string, rows: CalcRow[], color: [number, number, number]) => {
    if (!rows.length) return;

    // Заголовок секции
    doc.setFillColor(...color);
    doc.rect(left, y - 4, right - left, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(t(title, cyrillicOk), left + 3, y + 2);
    y += 10;

    doc.setTextColor(40, 40, 40);
    doc.setFont(font, 'normal');
    doc.setFontSize(10);

    rows.forEach((row, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }

      // Чередующийся фон строк
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 253);
        doc.rect(left, y - 4, right - left, 7, 'F');
      }

      doc.setTextColor(80, 80, 80);
      doc.setFont(font, 'normal');
      doc.text(t(row.label, cyrillicOk), left + 3, y);

      doc.setTextColor(20, 20, 20);
      doc.setFont(font, 'bold');
      doc.text(t(row.value, cyrillicOk), right - 3, y, { align: 'right' });
      doc.setFont(font, 'normal');
      y += 7;

      if (row.hint) {
        doc.setTextColor(130, 130, 130);
        doc.setFontSize(8);
        doc.text(t(row.hint, cyrillicOk), left + 5, y);
        doc.setFontSize(10);
        y += 4;
      }
    });
    y += 6;
  };

  drawSection('Исходные данные', payload.inputs, [15, 82, 186]);
  drawSection('Результаты расчёта', payload.results, [5, 150, 105]);

  // Подпись и нумерация страниц
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220);
    doc.line(left, 284, right, 284);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.setFont(font, 'normal');
    doc.text(
      t(`${payload.companyName || 'BIZNEST'}${payload.companyPhone ? ' · ' + payload.companyPhone : ''}`, cyrillicOk),
      left, 289
    );
    doc.text(`${t('Страница', cyrillicOk)} ${i} ${t('из', cyrillicOk)} ${pageCount}`, right, 289, { align: 'right' });
  }

  const safeName = (payload.calcTitle + '-' + payload.propertyTitle)
    .replace(/[^а-яёa-zA-Z0-9\-_ ]/gi, '').replace(/\s+/g, '-').slice(0, 60);
  doc.save(`${safeName || 'raschet'}.pdf`);
}
