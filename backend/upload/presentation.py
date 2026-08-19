"""
Генерация JPG-презентации объекта (формат A4, 1240x1754px, 150dpi) для соцсетей/статусов/клиентов.
Рисует: шапку (лого+телефон), номер объекта, заголовок, сетку из фото, цену, параметры,
коммуникации, описание и подвал с QR-кодом на страницу объекта.
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
FOOTER_H = 190

BRAND_BLUE = (11, 61, 132)
BRAND_BLUE_DARK = (8, 45, 97)
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
    content_bottom_limit = H - FOOTER_H

    # ---------- Шапка ----------
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
        font_phone = _font('Montserrat-Bold.ttf', 30)
        bb = draw.textbbox((0, 0), phone, font=font_phone)
        draw.text((W - PAD - (bb[2] - bb[0]), (header_h - (bb[3] - bb[1])) // 2 - bb[1]), phone, font=font_phone, fill=WHITE)

    y = header_h + 34

    # ---------- Номер + заголовок ----------
    badge_font = _font('IBMPlexSans-Medium.ttf', 22)
    badge_text = f"№ {listing.get('id')}"
    bb = draw.textbbox((0, 0), badge_text, font=badge_font)
    bw, bh = bb[2] - bb[0], bb[3] - bb[1]
    _rr(draw, [PAD, y, PAD + bw + 28, y + bh + 22], radius=10, fill=BG_LIGHT)
    draw.text((PAD + 14, y + 11 - bb[1]), badge_text, font=badge_font, fill=BRAND_BLUE)
    y += bh + 22 + 18

    title = listing.get('title') or ''
    font_title = _font('Montserrat-Black.ttf', 42)
    lines = _wrap(title, font_title, W - 2 * PAD, draw)
    if len(lines) > 2:
        lines = lines[:2]
        lines[1] = _ellipsize(lines[1], font_title, W - 2 * PAD, draw)
    for ln in lines:
        draw.text((PAD, y), ln, font=font_title, fill=TEXT_DARK)
        y += 52
    y += 8

    addr = listing.get('address') or listing.get('district') or ''
    if addr:
        font_addr = _font('IBMPlexSans-Regular.ttf', 24)
        pin_r = 5
        draw.ellipse([PAD, y + 8, PAD + pin_r * 2, y + 8 + pin_r * 2], fill=BRAND_BLUE)
        draw.text((PAD + pin_r * 2 + 10, y), addr, font=font_addr, fill=TEXT_GRAY)
        y += 46

    # ---------- Фото-сетка (до 10 шт, 5x2) ----------
    images = listing.get('images') or []
    images = images[:10]
    if images:
        cols = 5
        rows = 2 if len(images) > 5 else 1
        gap = 10
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
        y = gy + rows * (cell_h + gap) - gap + 40

    # ---------- Цена ----------
    draw.line([(PAD, y), (W - PAD, y)], fill=LINE, width=2)
    y += 32
    price_text = _format_price(listing.get('price'), listing.get('deal'))
    font_price = _font('Montserrat-Black.ttf', 58)
    draw.text((PAD, y), price_text, font=font_price, fill=BRAND_BLUE)
    bb = draw.textbbox((PAD, y), price_text, font=font_price)
    area = listing.get('area')
    price = listing.get('price')
    if area and price:
        ppm2 = f"{int(price / area):,}".replace(',', ' ') + ' ₽/м²'
        font_ppm2 = _font('IBMPlexSans-Medium.ttf', 24)
        draw.text((bb[2] + 22, bb[1] + (bb[3] - bb[1]) // 2 - 12), ppm2, font=font_ppm2, fill=TEXT_GRAY)
    y = bb[3] + 40

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
        pcell_h = 90
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
        y = y + prows * (pcell_h + pgap) - pgap + 44

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
        y += 48
        ux, uy = PAD, y
        row_h = 42
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
        y = uy + row_h + 30

    # ---------- Описание (заполняет оставшееся место) ----------
    description = (listing.get('description') or '').strip()
    if description and y < content_bottom_limit - 60:
        draw.text((PAD, y), "Описание", font=_font('Montserrat-ExtraBold.ttf', 26), fill=TEXT_DARK)
        y += 48

        font_desc = _font('IBMPlexSans-Regular.ttf', 21)
        line_h = 32
        max_lines = max(1, int((content_bottom_limit - y) // line_h))

        all_lines = []
        paragraphs = [p.strip() for p in description.split('\n') if p.strip()]
        for para in paragraphs:
            all_lines.extend(_wrap(para, font_desc, W - 2 * PAD, draw))
            all_lines.append('')
        if all_lines and all_lines[-1] == '':
            all_lines.pop()

        if len(all_lines) > max_lines:
            all_lines = all_lines[:max_lines]
            for i in range(len(all_lines) - 1, -1, -1):
                if all_lines[i] != '':
                    all_lines[i] = _ellipsize(all_lines[i], font_desc, W - 2 * PAD, draw)
                    break

        for ln in all_lines:
            if ln == '':
                y += line_h // 2
                continue
            draw.text((PAD, y), ln, font=font_desc, fill=(60, 68, 80))
            y += line_h

    # ---------- Подвал ----------
    footer_y = H - FOOTER_H
    draw.rectangle([0, footer_y, W, H], fill=BRAND_BLUE_DARK)

    site_url = (company.get('site_url') or '').rstrip('/')
    slug = listing.get('slug') or str(listing.get('id'))
    listing_url = f"{site_url}/object/{slug}?from=presentation" if site_url else None

    if listing_url:
        qr_size = 135
        qr = qrcode.QRCode(border=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10)
        qr.add_data(listing_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGB').resize((qr_size, qr_size), Image.LANCZOS)
        qr_x = W - PAD - qr_size
        qr_y = footer_y + 16
        _rr(draw, [qr_x - 10, qr_y - 10, qr_x + qr_size + 10, qr_y + qr_size + 10], radius=10, fill=WHITE)
        canvas.paste(qr_img, (qr_x, qr_y))
        cap_font = _font('IBMPlexSans-Medium.ttf', 15)
        cap = "Смотреть на сайте"
        cb = draw.textbbox((0, 0), cap, font=cap_font)
        draw.text((qr_x + qr_size // 2 - (cb[2] - cb[0]) // 2, qr_y + qr_size + 16), cap, font=cap_font, fill=WHITE)

    if logo_url:
        try:
            req = urllib.request.Request(logo_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                logo_bytes = resp.read()
            logo2 = Image.open(io.BytesIO(logo_bytes)).convert('RGBA')
            logo2_h = 48
            r2 = logo2_h / logo2.height
            logo2 = logo2.resize((max(1, int(logo2.width * r2)), logo2_h), Image.LANCZOS)
            logo2_y = footer_y + (FOOTER_H - logo2_h) // 2 - 20
            canvas.paste(logo2, (PAD, logo2_y), logo2)
            if site_url:
                site_font = _font('IBMPlexSans-Regular.ttf', 20)
                site_label = site_url.replace('https://', '').replace('http://', '')
                draw.text((PAD, logo2_y + logo2_h + 16), site_label, font=site_font, fill=(200, 210, 225))
        except Exception:
            pass

    out = io.BytesIO()
    canvas.convert('RGB').save(out, format='JPEG', quality=90, optimize=True)
    return out.getvalue()