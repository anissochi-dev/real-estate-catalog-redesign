"""
Генерация QR-баннера для типографии: TIFF, CMYK, LZW, встроенный ICC-профиль ISO Coated v2 (FOGRA39).

Макет приходит из редактора в «баннерных» единицах (20 ед. = 1 см) и масштабируется
к физическому размеру с нужным DPI. Сплошные цвета (фон, текст) переводятся в CMYK
через профиль (или задаются вручную), QR-код и чёрный текст печатаются чистым K=100%.
Фото и логотип переводятся из sRGB через ICC (perceptual).
"""
import base64
import io
import urllib.request

from PIL import Image, ImageCms, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = 60_000_000

from fonts_data import FONTS_B64

UNITS_PER_CM = 20
BASELINE = 0.8585
DEAL_LS = 0.03
PHONE_LS = 0.01
QR_PAD = 0.05
PHONE_PLACEHOLDER = '+7 ─── ─── ────'

MAX_MP = 150          # предел мегапикселей одного файла (≈ до 150 МБ TIFF)
MAX_SIDE_CM = 1000

_ICC_BYTES = None
_TRANSFORM = None
_FONT_CACHE: dict = {}

WEIGHT_FONT = {900: 'Montserrat-Black.ttf', 800: 'Montserrat-ExtraBold.ttf', 700: 'Montserrat-Bold.ttf'}


def icc_bytes():
    global _ICC_BYTES
    if _ICC_BYTES is None:
        import zlib
        from icc_data import ICC_ZLIB_B64
        _ICC_BYTES = zlib.decompress(base64.b64decode(ICC_ZLIB_B64))
    return _ICC_BYTES


def _transform():
    global _TRANSFORM
    if _TRANSFORM is None:
        srgb = ImageCms.createProfile('sRGB')
        cmyk = ImageCms.ImageCmsProfile(io.BytesIO(icc_bytes()))
        _TRANSFORM = ImageCms.buildTransform(srgb, cmyk, 'RGB', 'CMYK', renderingIntent=0)
    return _TRANSFORM


def auto_dpi(w_cm, h_cm):
    longest = max(w_cm, h_cm)
    if longest <= 100:
        return 150
    if longest <= 300:
        return 100
    return 72


def _hex_rgb(h):
    h = (h or '#000000').lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (0, 0, 0)


def rgb_to_cmyk(rgb):
    """Один цвет sRGB → CMYK (0..255) через профиль. Чёрный/белый — чистые значения."""
    if rgb == (255, 255, 255):
        return (0, 0, 0, 0)
    if max(rgb) <= 24 and max(rgb) - min(rgb) <= 8:
        return (0, 0, 0, 255)
    px = Image.new('RGB', (1, 1), rgb)
    return ImageCms.applyTransform(px, _transform()).getpixel((0, 0))


def _cmyk_from_percent(v):
    if not v or len(v) != 4:
        return None
    try:
        return tuple(max(0, min(255, round(float(x) * 2.55))) for x in v)
    except (TypeError, ValueError):
        return None


def _font(weight, size):
    name = WEIGHT_FONT.get(weight, 'Montserrat-Black.ttf')
    key = (name, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(io.BytesIO(base64.b64decode(FONTS_B64[name])), size)
        if len(_FONT_CACHE) > 24:
            _FONT_CACHE.pop(next(iter(_FONT_CACHE)))
    return _FONT_CACHE[key]


def _fetch_image(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 print-banner'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(25 * 1024 * 1024)
    return Image.open(io.BytesIO(data))


def _to_cmyk(im):
    if im.mode == 'CMYK':
        return im
    return ImageCms.applyTransform(im.convert('RGB'), _transform())


def _cover(im, side):
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return im.resize((side, side), Image.LANCZOS)


def _contain(im, side):
    w, h = im.size
    k = side / max(w, h)
    return im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def _qr_matrix(url):
    import qrcode
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=0, box_size=1)
    qr.add_data(url)
    qr.make(fit=True)
    return qr.get_matrix()


def plan(p):
    """Считает итоговые размеры без рендера (для предпросмотра и проверки лимитов)."""
    w_cm = float(p['width_cm'])
    h_cm = float(p['height_cm'])
    if not (1 <= w_cm <= MAX_SIDE_CM and 1 <= h_cm <= MAX_SIDE_CM):
        raise ValueError(f'Размер должен быть от 1 до {MAX_SIDE_CM} см')
    dpi = int(p.get('dpi') or auto_dpi(w_cm, h_cm))
    dpi = max(50, min(300, dpi))
    bleed_mm = max(0.0, min(100.0, float(p.get('bleed_mm') or 0)))
    full_w_cm = w_cm + bleed_mm / 5
    full_h_cm = h_cm + bleed_mm / 5
    px_w = round(full_w_cm / 2.54 * dpi)
    px_h = round(full_h_cm / 2.54 * dpi)
    mp = px_w * px_h / 1e6
    return {
        'width_cm': w_cm, 'height_cm': h_cm, 'dpi': dpi, 'bleed_mm': bleed_mm,
        'full_width_cm': round(full_w_cm, 2), 'full_height_cm': round(full_h_cm, 2),
        'px_w': px_w, 'px_h': px_h, 'megapixels': round(mp, 1),
        'too_big': mp > MAX_MP, 'max_mp': MAX_MP,
        'est_mb_raw': round(mp * 4, 1),
    }


BAND_ROWS = 256


def _text_layer(color, text, size, weight, ls_em, x, y, opacity=1.0):
    """Строка текста рисуется один раз в плотную маску (1 байт/пиксель) и затем
    вклеивается по полосам. y — верх строки (line-height: 1, как в редакторе)."""
    font = _font(weight, size)
    ls = ls_em * size
    glyphs, cx = [], 0.0
    left = top = float('inf')
    right = bottom = float('-inf')
    for ch in text:
        b = font.getbbox(ch, anchor='ls')
        if b[2] > b[0]:
            left, right = min(left, cx + b[0]), max(right, cx + b[2])
            top, bottom = min(top, b[1]), max(bottom, b[3])
        glyphs.append((cx, ch))
        cx += font.getlength(ch) + ls
    if left == float('inf'):
        return ('none',)
    ox, oy = int(left) - 2, int(top) - 2
    mask = Image.new('L', (int(right - ox) + 3, int(bottom - oy) + 3), 0)
    md = ImageDraw.Draw(mask)
    for gx, ch in glyphs:
        md.text((gx - ox, -oy), ch, font=font, fill=int(255 * opacity), anchor='ls')
    return ('solid', color, mask, round(x + ox), round(y + size * BASELINE + oy))


QR_LABEL_MAX_SHARE = 0.28


def _qr_label_layers(fg, label, side, n, qx, qy):
    """Белая плашка с названием сайта в центре QR (код создаётся с коррекцией H — 30%)."""
    max_w = side * QR_LABEL_MAX_SHARE
    fs = max(4, int(max_w / 2))
    while fs > 4 and _font(800, fs).getlength(label) + fs * 0.7 > max_w:
        fs -= 1
    if fs < 4:
        return []
    tw = _font(800, fs).getlength(label)
    box_w = round(min(max_w, tw + fs * 0.7))
    box_h = round(fs * 1.6)
    cx, cy = qx + side / 2, qy + side / 2
    radius = round(min(box_h / 3, 2 * side / n))
    plate = Image.new('L', (box_w, box_h), 0)
    ImageDraw.Draw(plate).rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=radius, fill=255)
    white = Image.new('CMYK', (box_w, box_h), (0, 0, 0, 0))
    layers = [('img', white, plate, round(cx - box_w / 2), round(cy - box_h / 2))]
    text = _text_layer(fg, label, fs, 800, 0, 0, 0)
    if text[0] == 'solid':
        _, color, mask, _x, _y = text
        layers.append(('solid', color, mask, round(cx - mask.width / 2), round(cy - mask.height / 2)))
    return layers


def _build_layers(p, info, k, bleed_px, fg, fetched, warnings):
    """Слои макета в координатах итогового холста. Каждый слой рисуется в любую полосу."""
    els = {e.get('id'): e for e in (p.get('elements') or [])}
    layers = []
    px_per_cm = k * UNITS_PER_CM

    def X(v):
        return bleed_px + v * k

    photo = els.get('photo')
    if photo and fetched.get('photo') is not None:
        side = max(1, round((photo.get('imgSize') or 120) * k))
        im = _to_cmyk(_cover(fetched['photo'], side))
        mask = Image.new('L', (side, side), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, side - 1, side - 1], radius=round(10 * k), fill=255)
        layers.append(('img', im, mask, round(X(photo['pos']['x'])), round(X(photo['pos']['y']))))

    for el_id, text, weight, ls in (
        ('deal', p.get('deal_text') or '', 900, DEAL_LS),
        ('phone', p.get('phone_text') or PHONE_PLACEHOLDER, 800, PHONE_LS),
    ):
        el = els.get(el_id)
        if not el or not text:
            continue
        size = round((el.get('fontSize') or 20) * k)
        if size < 2:
            continue
        layers.append(_text_layer(fg, text, size, weight, ls, X(el['pos']['x']), X(el['pos']['y'])))

    qr = els.get('qr')
    if qr and p.get('qr_url'):
        size_u = qr.get('imgSize') or 80
        pad_u = round(size_u * QR_PAD)
        box = round((size_u + 2 * pad_u) * k)
        bx, by = round(X(qr['pos']['x'])), round(X(qr['pos']['y']))
        layers.append(('rrect', (0, 0, 0, 0), bx, by, box, round(pad_u * 2 * k), 38))
        matrix = _qr_matrix(p['qr_url'])
        n = len(matrix)
        side = round(size_u * k)
        small = Image.new('L', (n, n), 0)
        small.putdata([255 if c else 0 for row in matrix for c in row])
        layers.append(('qr', fg, small, round(X(qr['pos']['x'] + pad_u)), round(X(qr['pos']['y'] + pad_u)), side))
        label = (p.get('qr_label') or '').strip()[:40]
        if label:
            layers.extend(_qr_label_layers(fg, label, side, n,
                                           round(X(qr['pos']['x'] + pad_u)), round(X(qr['pos']['y'] + pad_u))))
        info['qr_side_cm'] = round(side / px_per_cm, 1)
        info['qr_module_mm'] = round(side / n / px_per_cm * 10, 2)
        if side / n / px_per_cm * 10 < 1.5:
            warnings.append('QR-код мелкий для печати — увеличьте его сторону')

    logo = els.get('logo')
    if logo and fetched.get('logo') is not None:
        side = max(1, round((logo.get('imgSize') or 70) * k))
        src = _contain(fetched['logo'], side)
        alpha = src.convert('RGBA').split()[-1]
        im = _to_cmyk(src)
        lw, lh = im.size
        layers.append(('img', im, alpha, round(X(logo['pos']['x']) + (side - lw) / 2), round(X(logo['pos']['y']) + (side - lh) / 2)))

    if p.get('show_size'):
        bw_u, bh_u = info['width_cm'] * UNITS_PER_CM, info['height_cm'] * UNITS_PER_CM
        base = min(bw_u, bh_u)
        fs = round(max(8, base * 0.035) * k)
        off_u = max(4, base * 0.015)
        if fs >= 2:
            label = f"{p.get('size_label_w', info['width_cm'])} см × {p.get('size_label_h', info['height_cm'])} см"
            tw = _font(700, fs).getlength(label)
            layers.append(_text_layer(fg, label, fs, 700, 0, X(bw_u - off_u) - tw, X(bh_u - off_u) - fs, 0.55))
    return layers


def _draw_band(band, y0, layers):
    bh = band.height
    for L in layers:
        kind = L[0]
        if kind == 'none':
            continue
        if kind == 'rrect':
            _, color, x, y, box, radius, alpha = L
            top, bottom = max(y0, y), min(y0 + bh, y + box)
            if top >= bottom:
                continue
            m = Image.new('L', (box, bottom - top), 0)
            ImageDraw.Draw(m).rounded_rectangle([0, y - top, box - 1, y - top + box - 1], radius=radius, fill=alpha)
            band.paste(color, (x, top - y0, x + box, bottom - y0), m)
            del m
            continue
        if kind == 'qr':
            _, color, small, x, y, side = L
            top, bottom = max(y0, y), min(y0 + bh, y + side)
            if top >= bottom:
                continue
            n = small.height
            part = small.resize((side, bottom - top), Image.NEAREST,
                                box=(0, (top - y) * n / side, n, (bottom - y) * n / side))
            band.paste(color, (x, top - y0, x + side, bottom - y0), part)
            continue
        _, src, mask, x, y = L
        h = mask.height
        top, bottom = max(y0, y), min(y0 + bh, y + h)
        if top >= bottom:
            continue
        m = mask.crop((0, top - y, mask.width, bottom - y))
        if kind == 'img':
            band.paste(src.crop((0, top - y, src.width, bottom - y)), (x, top - y0), m)
        else:
            band.paste(src, (x, top - y0, x + mask.width, bottom - y0), m)


def _lzw_strip(band):
    buf = io.BytesIO()
    band.save(buf, format='TIFF', compression='tiff_lzw', tiffinfo={278: band.height})
    t = Image.open(io.BytesIO(buf.getvalue()))
    off, cnt = t.tag_v2[273], t.tag_v2[279]
    data = buf.getvalue()
    return b''.join(data[o:o + c] for o, c in zip(off, cnt))


def _write_tiff(W, H, dpi, strips, rows, icc):
    import struct
    out = io.BytesIO()
    out.write(b'II*\x00' + b'\x00' * 4)
    offsets = []
    for s in strips:
        offsets.append(out.tell())
        out.write(s)
        if out.tell() % 2:
            out.write(b'\x00')
    extra = io.BytesIO()
    base = out.tell()

    def put(b):
        pos = base + extra.tell()
        extra.write(b)
        if extra.tell() % 2:
            extra.write(b'\x00')
        return pos

    n = len(strips)
    bps = put(struct.pack('<4H', 8, 8, 8, 8))
    so = put(struct.pack(f'<{n}I', *offsets)) if n > 1 else offsets[0]
    sc_vals = [len(s) for s in strips]
    sc = put(struct.pack(f'<{n}I', *sc_vals)) if n > 1 else sc_vals[0]
    xres = put(struct.pack('<2I', int(dpi), 1))
    yres = put(struct.pack('<2I', int(dpi), 1))
    icc_off = put(icc)
    ifd_off = base + extra.tell()
    entries = [
        (256, 4, 1, W), (257, 4, 1, H), (258, 3, 4, bps), (259, 3, 1, 5), (262, 3, 1, 5),
        (273, 4, n, so), (277, 3, 1, 4), (278, 4, 1, rows), (279, 4, n, sc),
        (282, 5, 1, xres), (283, 5, 1, yres), (284, 3, 1, 1), (296, 3, 1, 2), (34675, 7, len(icc), icc_off),
    ]
    ifd = struct.pack('<H', len(entries))
    for tag, typ, cnt, val in entries:
        if typ == 3 and cnt == 1:
            ifd += struct.pack('<HHIHH', tag, typ, cnt, val, 0)
        else:
            ifd += struct.pack('<HHII', tag, typ, cnt, val)
    ifd += struct.pack('<I', 0)
    out.write(extra.getvalue())
    out.write(ifd)
    data = bytearray(out.getvalue())
    data[4:8] = struct.pack('<I', ifd_off)
    return bytes(data)


def render(p):
    """Рисует баннер полосами (память не зависит от размера холста).
    Возвращает (tiff_bytes, proof_jpg_bytes, info)."""
    info = plan(p)
    if info['too_big']:
        raise ValueError(
            f"Слишком большой файл: {info['megapixels']} Мп при {info['dpi']} dpi. "
            f"Уменьшите разрешение (максимум {MAX_MP} Мп)"
        )
    dpi = info['dpi']
    px_per_cm = dpi / 2.54
    k = px_per_cm / UNITS_PER_CM
    bleed_px = round(info['bleed_mm'] / 10 * px_per_cm)
    W, H = info['px_w'], info['px_h']

    bg = _cmyk_from_percent(p.get('bg_cmyk')) or rgb_to_cmyk(_hex_rgb(p.get('bg_color', '#ffffff')))
    fg = _cmyk_from_percent(p.get('text_cmyk')) or rgb_to_cmyk(_hex_rgb(p.get('text_color', '#000000')))
    warnings = []

    fetched = {}
    for key, url_key, label in (('photo', 'photo_url', 'Фото'), ('logo', 'logo_url', 'Логотип')):
        if p.get(url_key) and any(e.get('id') == key for e in (p.get('elements') or [])):
            try:
                im = _fetch_image(p[url_key])
                im.load()
                fetched[key] = im
            except Exception as e:
                warnings.append(f'{label} не добавлен: {str(e)[:80]}')

    layers = _build_layers(p, info, k, bleed_px, fg, fetched, warnings)
    rows = max(BAND_ROWS, min(H, int(12_000_000 / (W * 4))))
    strips = []
    for y0 in range(0, H, rows):
        band = Image.new('CMYK', (W, min(rows, H - y0)), bg)
        _draw_band(band, y0, layers)
        strips.append(_lzw_strip(band))
        del band
    del layers
    tiff = _write_tiff(W, H, dpi, strips, rows, icc_bytes())
    del strips

    s = min(1.0, 1200 / max(W, H))
    pk = k * s
    pw, ph = max(1, round(W * s)), max(1, round(H * s))
    small = Image.new('CMYK', (pw, ph), bg)
    _draw_band(small, 0, _build_layers(p, dict(info), pk, round(bleed_px * s), fg, fetched, []))
    cmyk_prof = ImageCms.ImageCmsProfile(io.BytesIO(icc_bytes()))
    proof = ImageCms.profileToProfile(small, cmyk_prof, ImageCms.createProfile('sRGB'), renderingIntent=1, outputMode='RGB')
    pb = io.BytesIO()
    proof.save(pb, format='JPEG', quality=88)
    del small, proof, fetched

    info['size_bytes'] = len(tiff)
    info['warnings'] = warnings
    info['bg_cmyk'] = [round(c / 2.55) for c in bg]
    info['text_cmyk'] = [round(c / 2.55) for c in fg]
    return tiff, pb.getvalue(), info