"""
Верхняя часть презентации: синяя шапка (лого, телефон, домен, номер объекта) и заголовок с адресом и QR-кодом.
"""
import io
import urllib.request

from pres_common import W, PAD, BRAND_BLUE, TEXT_DARK, TEXT_GRAY, BG_LIGHT, WHITE, _font, _rr, _wrap, _ellipsize


def draw_header(canvas, draw, listing, company, site_label):
    """Рисует шапку. Возвращает y, с которого начинается контент."""
    from PIL import Image

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
    return y


def draw_title_qr(canvas, draw, listing, site_url, y):
    """Рисует заголовок, адрес и QR-код на страницу объекта. Возвращает новый y."""
    from PIL import Image
    import qrcode

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
    return y
