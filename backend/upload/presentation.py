"""
Генерация JPG-презентации объекта (формат A4, 1240x1754px, 150dpi) для соцсетей/статусов/клиентов.
Рисует: шапку (лого слева, телефон по центру, домен+номер объекта справа), заголовок с QR-кодом
на страницу объекта справа от названия, сетку из фото, цену, параметры, коммуникации и описание.
Синего подвала больше нет — вся площадь страницы отдана под контент.
"""
import base64
import io
import math
import os
import secrets
import urllib.request

from fonts_data import FONTS_B64

_FONT_CACHE: dict = {}

W, H = 1240, 1754
PAD = 56
BOTTOM_MARGIN = 34

BRAND_BLUE = (11, 61, 132)
TEXT_DARK = (26, 32, 44)
TEXT_GRAY = (100, 110, 125)
BG_LIGHT = (245, 247, 250)
WHITE = (255, 255, 255)
LINE = (225, 229, 235)
GREEN = (16, 150, 90)

TYPE_LABELS = {
    'office': 'Офис', 'retail': 'Торговое помещение', 'warehouse': 'Склад',
    'restaurant': 'Общепит', 'business': 'Готовый бизнес', 'production': 'Производственное помещение',
    'hotel': 'Гостиница', 'gab': 'ГАБ', 'land': 'Земельный участок', 'building': 'Отдельно стоящее здание',
    'free_purpose': 'Помещение свободного назначения', 'car_service': 'Автосервис',
}
DEAL_LABELS = {'sale': 'Продажа', 'rent': 'Аренда', 'business': 'Готовый бизнес'}
CONDITION_LABELS = {
    'new': 'Дизайнерский ремонт', 'euro': 'Евроремонт', 'good': 'Косметический ремонт',
    'cosmetic': 'Предчистовая', 'rough': 'Без отделки', 'shellcore': 'Черновая отделка',
}
PARKING_LABELS = {'none': 'Нет', 'street': 'На улице', 'building': 'В здании'}


def _font(name, size):
    from PIL import ImageFont
    key = (name, size)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    font_bytes = base64.b64decode(FONTS_B64[name])
    font = ImageFont.truetype(io.BytesIO(font_bytes), size)
    _FONT_CACHE[key] = font
    return font


def _rr(draw, xy, radius, fill=None):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def _wrap(text, font, max_width, draw):
    words = text.split()
    lines, cur = [], ''
    for w in words:
        test = (cur + ' ' + w).strip()
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] - bb[0] <= max_width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _ellipsize(text, font, max_width, draw):
    while draw.textbbox((0, 0), text + '…', font=font)[2] > max_width and len(text) > 3:
        text = text[:-1]
    return text + '…'


def _fetch_image(url, timeout=8):
    from PIL import Image
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
    return Image.open(io.BytesIO(data)).convert('RGB')


def _format_price(price, deal):
    if not price:
        return '—'
    if deal == 'rent':
        return f"{int(price):,}".replace(',', ' ') + ' ₽/мес'
    return f"{int(price):,}".replace(',', ' ') + ' ₽'


def _normalize_price(listing):
    """Возвращает (total_price, price_per_m2) в рублях с учётом price_unit.

    В БД price хранится в единице, заданной price_unit: 'm2' — цена уже за метр,
    иначе (в т.ч. 'total') — уже итоговая стоимость объекта. Логика идентична
    _normalize_price() в backend/listings/index.py — защита от кривых данных:
    если price_unit='m2', но цена > 200 000 ₽ (нереально для цены за метр),
    считаем что в price уже итоговая стоимость.
    """
    try:
        price = float(listing.get('price') or 0)
    except (TypeError, ValueError):
        price = 0
    try:
        area = float(listing.get('area') or 0)
    except (TypeError, ValueError):
        area = 0
    unit = listing.get('price_unit')
    if unit == 'm2' and area > 0 and 0 < price <= 200_000:
        return int(round(price * area)), int(round(price))
    if area > 0 and price > 0:
        return int(price), int(round(price / area))
    return int(price), None


def generate(listing: dict, company: dict) -> bytes:
    """
    listing: dict с полями id, title, address, district, price, deal, area,
             land_area, type/category, condition, ceiling_height, parking,
             total_floors, utilities (csv string), description, images (list[str]), slug
    company: dict с полями logo_url, company_phone, site_url
    Возвращает JPEG bytes готовой презентации.
    """
    from PIL import Image, ImageDraw
    import qrcode

    canvas = Image.new('RGB', (W, H), WHITE)
    draw = ImageDraw.Draw(canvas)
    content_bottom_limit = H - BOTTOM_MARGIN

    site_url = (company.get('site_url') or '').rstrip('/')
    site_label = site_url.replace('https://', '').replace('http://', '') if site_url else ''

    # ---------- Шапка: лого слева, телефон по центру, домен+номер объекта справа ----------
    header_h = 110
    draw.rectangle([0, 0, W, header_h], fill=BRAND_BLUE)
    logo_url = company.get('logo_url')
    try:
        if logo_url:
            req = urllib.request.Request(logo_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                logo_bytes = resp.read()
            logo = Image.open(io.BytesIO(logo_bytes)).convert('RGBA')
            logo_h = 62
            ratio = logo_h / logo.height
            logo = logo.resize((max(1, int(logo.width * ratio)), logo_h), Image.LANCZOS)
            canvas.paste(logo, (PAD, (header_h - logo_h) // 2), logo)
    except Exception:
        pass

    phone = company.get('company_phone') or ''
    if phone:
        font_phone = _font('Montserrat-Black.ttf', 38)
        bb = draw.textbbox((0, 0), phone, font=font_phone)
        pw, ph = bb[2] - bb[0], bb[3] - bb[1]
        draw.text(((W - pw) // 2 - bb[0], (header_h - ph) // 2 - bb[1]), phone, font=font_phone, fill=WHITE)

    # Справа: домен сайта сверху, номер объекта крупным шрифтом под ним
    badge_text = f"№ {listing.get('id')}"
    font_badge = _font('Montserrat-Black.ttf', 34)
    bb_badge = draw.textbbox((0, 0), badge_text, font=font_badge)
    bad_w, bad_h = bb_badge[2] - bb_badge[0], bb_badge[3] - bb_badge[1]

    if site_label:
        font_site = _font('IBMPlexSans-Medium.ttf', 20)
        bb_site = draw.textbbox((0, 0), site_label, font=font_site)
        site_w = bb_site[2] - bb_site[0]
        block_h = bad_h + (bb_site[3] - bb_site[1]) + 6
        top = (header_h - block_h) // 2
        draw.text((W - PAD - site_w, top - bb_site[1]), site_label, font=font_site, fill=(200, 214, 235))
        draw.text((W - PAD - bad_w, top + (bb_site[3] - bb_site[1]) + 6 - bb_badge[1]), badge_text, font=font_badge, fill=WHITE)
    else:
        draw.text((W - PAD - bad_w, (header_h - bad_h) // 2 - bb_badge[1]), badge_text, font=font_badge, fill=WHITE)

    y = header_h + 34

    # ---------- Заголовок (слева) + QR-код на страницу объекта (справа) ----------
    slug = listing.get('slug') or str(listing.get('id'))
    listing_url = f"{site_url}/object/{slug}?from=presentation" if site_url else None

    qr_size = 0
    if listing_url:
        qr_size = int(135 * 1.5)  # крупнее в 1.5 раза
        qr = qrcode.QRCode(border=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10)
        qr.add_data(listing_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGB').resize((qr_size, qr_size), Image.LANCZOS)
        qr_x = W - PAD - qr_size
        qr_y = y
        _rr(draw, [qr_x - 10, qr_y - 10, qr_x + qr_size + 10, qr_y + qr_size + 10], radius=10, fill=BG_LIGHT)
        canvas.paste(qr_img, (qr_x, qr_y))
        cap_font = _font('IBMPlexSans-Medium.ttf', 14)
        cap = "Смотреть на сайте"
        cb = draw.textbbox((0, 0), cap, font=cap_font)
        draw.text((qr_x + qr_size // 2 - (cb[2] - cb[0]) // 2, qr_y + qr_size + 14), cap, font=cap_font, fill=TEXT_GRAY)

    title_max_w = W - 2 * PAD - (qr_size + 30 if qr_size else 0)
    title_top_y = y
    title = listing.get('title') or ''
    font_title = _font('Montserrat-Black.ttf', 42)
    lines = _wrap(title, font_title, title_max_w, draw)
    if len(lines) > 2:
        lines = lines[:2]
        lines[1] = _ellipsize(lines[1], font_title, title_max_w, draw)
    for ln in lines:
        draw.text((PAD, y), ln, font=font_title, fill=TEXT_DARK)
        y += 52
    y += 8

    addr = listing.get('address') or listing.get('district') or ''
    if addr:
        font_addr = _font('IBMPlexSans-Regular.ttf', 32)
        pin_r = 6
        draw.ellipse([PAD, y + 10, PAD + pin_r * 2, y + 10 + pin_r * 2], fill=BRAND_BLUE)
        draw.text((PAD + pin_r * 2 + 12, y), _ellipsize(addr, font_addr, title_max_w - pin_r * 2 - 12, draw) if draw.textbbox((0, 0), addr, font=font_addr)[2] > title_max_w - pin_r * 2 - 12 else addr, font=font_addr, fill=TEXT_GRAY)
        y += 56

    # Если после заголовка+адреса контент короче блока QR — опускаем y до низа QR,
    # чтобы фото-сетка не наезжала на QR-код.
    if qr_size:
        y = max(y, title_top_y + qr_size + 40)

    # ---------- Фото-сетка (до 6 шт, 3x2, крупные ячейки) ----------
    images = listing.get('images') or []
    images = images[:6]
    if images:
        cols = 3
        rows = 2 if len(images) > 3 else 1
        gap = 12
        cell_w = (W - 2 * PAD - gap * (cols - 1)) / cols
        cell_h = cell_w * 0.78
        gy = y
        for idx, url in enumerate(images):
            col, row = idx % cols, idx // cols
            cx, cy = PAD + col * (cell_w + gap), gy + row * (cell_h + gap)
            try:
                img = _fetch_image(url)
            except Exception:
                continue
            target_ratio = cell_w / cell_h
            iw, ih = img.size
            if iw / ih > target_ratio:
                nw = int(ih * target_ratio)
                off = (iw - nw) // 2
                img = img.crop((off, 0, off + nw, ih))
            else:
                nh = int(iw / target_ratio)
                off = (ih - nh) // 2
                img = img.crop((0, off, iw, off + nh))
            img = img.resize((int(cell_w), int(cell_h)), Image.LANCZOS)
            mask = Image.new('L', img.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius=10, fill=255)
            canvas.paste(img, (int(cx), int(cy)), mask)
        y = gy + rows * (cell_h + gap) - gap + 28

    # ---------- Цена ----------
    draw.line([(PAD, y), (W - PAD, y)], fill=LINE, width=2)
    y += 28
    total_price, price_per_m2 = _normalize_price(listing)
    price_text = _format_price(total_price, listing.get('deal'))
    font_price = _font('Montserrat-Black.ttf', 58)
    draw.text((PAD, y), price_text, font=font_price, fill=BRAND_BLUE)
    bb = draw.textbbox((PAD, y), price_text, font=font_price)
    if price_per_m2:
        ppm2_text = f"{price_per_m2:,}".replace(',', ' ') + ' ₽/м²'
        # Тот же шрифт (Montserrat-Black), что и у основной цены, выровнена по
        # ПРАВОМУ краю страницы. Если не помещается рядом с основной ценой —
        # уменьшаем размер только у ppm2, пока не влезет (основную цену не трогаем).
        ppm2_size = 58
        font_ppm2 = _font('Montserrat-Black.ttf', ppm2_size)
        available_w = (W - PAD) - (bb[2] + 26)
        while draw.textbbox((0, 0), ppm2_text, font=font_ppm2)[2] > available_w and ppm2_size > 28:
            ppm2_size -= 4
            font_ppm2 = _font('Montserrat-Black.ttf', ppm2_size)
        bb_ppm2 = draw.textbbox((0, 0), ppm2_text, font=font_ppm2)
        ppm2_w = bb_ppm2[2] - bb_ppm2[0]
        # Выравниваем по нижней базовой линии с основной ценой и по правому краю страницы
        ppm2_y = bb[3] - (bb_ppm2[3] - bb_ppm2[1]) - bb_ppm2[1]
        draw.text((W - PAD - ppm2_w, ppm2_y), ppm2_text, font=font_ppm2, fill=TEXT_GRAY)
    y = bb[3] + 32

    # ---------- Параметры ----------
    params = []
    if listing.get('area'):
        params.append(("Площадь", f"{listing['area']:g} м²"))
    if listing.get('land_area'):
        params.append(("Участок", f"{float(listing['land_area']):g} сот."))
    deal_label = DEAL_LABELS.get(listing.get('deal'), listing.get('deal') or '—')
    params.append(("Тип сделки", deal_label))
    cond = CONDITION_LABELS.get(listing.get('condition'))
    if cond:
        params.append(("Состояние", cond))
    if listing.get('ceiling_height'):
        ch = f"{float(listing['ceiling_height']):g}".replace('.', ',')
        params.append(("Высота потолков", f"{ch} м"))
    parking = PARKING_LABELS.get(listing.get('parking'))
    if parking and parking != 'Нет':
        params.append(("Парковка", parking))
    if listing.get('floor') and listing.get('total_floors'):
        params.append(("Этаж", f"{listing['floor']} из {listing['total_floors']}"))
    params = params[:6]

    if params:
        font_pl = _font('IBMPlexSans-Regular.ttf', 18)
        pcols, pgap = 3, 16
        pcell_w = (W - 2 * PAD - pgap * (pcols - 1)) / pcols
        pcell_h = 82
        for idx, (label, value) in enumerate(params):
            col, row = idx % pcols, idx // pcols
            px, py = PAD + col * (pcell_w + pgap), y + row * (pcell_h + pgap)
            _rr(draw, [px, py, px + pcell_w, py + pcell_h], radius=14, fill=BG_LIGHT)
            draw.text((px + 20, py + 16), label, font=font_pl, fill=TEXT_GRAY)
            # Автоуменьшение шрифта значения, если не помещается по ширине карточки
            max_val_w = pcell_w - 40
            v_size = 25
            font_pv = _font('Montserrat-ExtraBold.ttf', v_size)
            while draw.textbbox((0, 0), value, font=font_pv)[2] > max_val_w and v_size > 16:
                v_size -= 2
                font_pv = _font('Montserrat-ExtraBold.ttf', v_size)
            v = value if draw.textbbox((0, 0), value, font=font_pv)[2] <= max_val_w else _ellipsize(value, font_pv, max_val_w, draw)
            draw.text((px + 20, py + 46), v, font=font_pv, fill=TEXT_DARK)
        prows = math.ceil(len(params) / pcols)
        y = y + prows * (pcell_h + pgap) - pgap + 32

    # ---------- Коммуникации ----------
    utilities_raw = listing.get('utilities') or ''
    utilities = []
    if utilities_raw:
        for part in utilities_raw.split(','):
            part = part.strip()
            if not part:
                continue
            name = part.split(':')[0].strip()
            if name and name not in utilities:
                utilities.append(name)
    utilities = utilities[:8]

    if utilities and y < content_bottom_limit - 80:
        draw.text((PAD, y), "Коммуникации", font=_font('Montserrat-ExtraBold.ttf', 26), fill=TEXT_DARK)
        y += 40
        ux, uy = PAD, y
        row_h = 38
        font_util = _font('IBMPlexSans-Regular.ttf', 21)
        for u in utilities:
            if uy + row_h > content_bottom_limit:
                break
            r = 10
            cx, cy = ux + r, uy + row_h // 2
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
            draw.line([(cx - 4, cy), (cx - 1, cy + 4), (cx + 5, cy - 5)], fill=WHITE, width=3)
            tx = ux + r * 2 + 12
            draw.text((tx, uy + row_h // 2 - 14), u, font=font_util, fill=TEXT_DARK)
            bb = draw.textbbox((0, 0), u, font=font_util)
            ux += r * 2 + 12 + (bb[2] - bb[0]) + 44
            if ux > W - PAD - 160:
                ux = PAD
                uy += row_h
        y = uy + row_h + 20

    # ---------- Описание (заполняет оставшееся место — уплотнено для большего объёма текста) ----------
    description = (listing.get('description') or '').strip()
    if description and y < content_bottom_limit - 60:
        draw.text((PAD, y), "Описание", font=_font('Montserrat-ExtraBold.ttf', 26), fill=TEXT_DARK)
        y += 40

        font_desc = _font('IBMPlexSans-Regular.ttf', 19)
        line_h = 27
        para_gap = 9
        available_h = content_bottom_limit - y

        all_lines = []
        paragraphs = [p.strip() for p in description.split('\n') if p.strip()]
        for para in paragraphs:
            all_lines.extend(_wrap(para, font_desc, W - 2 * PAD, draw))
            all_lines.append('')
        if all_lines and all_lines[-1] == '':
            all_lines.pop()

        # Считаем реальную занимаемую высоту (пустая строка-разделитель абзаца
        # занимает para_gap, а не полную line_h) и обрезаем ровно по месту,
        # а не по числу строк — так текста помещается заметно больше.
        used_h = 0
        cut_at = len(all_lines)
        for i, ln in enumerate(all_lines):
            step = para_gap if ln == '' else line_h
            if used_h + step > available_h:
                cut_at = i
                break
            used_h += step
        if cut_at < len(all_lines):
            all_lines = all_lines[:cut_at]
            for i in range(len(all_lines) - 1, -1, -1):
                if all_lines[i] != '':
                    all_lines[i] = _ellipsize(all_lines[i], font_desc, W - 2 * PAD, draw)
                    break

        for ln in all_lines:
            if ln == '':
                y += para_gap
                continue
            draw.text((PAD, y), ln, font=font_desc, fill=(60, 68, 80))
            y += line_h

    # Подвал убран полностью — QR-код и домен уже выведены в шапке/у заголовка выше.

    out = io.BytesIO()
    canvas.convert('RGB').save(out, format='JPEG', quality=90, optimize=True)
    return out.getvalue()