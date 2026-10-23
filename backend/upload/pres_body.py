"""
Основная часть презентации: фото-сетка, цена, параметры, коммуникации и описание.
"""
import math

from pres_common import (
    W, PAD, BRAND_BLUE, TEXT_DARK, TEXT_GRAY, BG_LIGHT, WHITE, LINE, GREEN,
    DEAL_LABELS, CONDITION_LABELS, PARKING_LABELS,
    _font, _rr, _ellipsize, _wrap, _fetch_image, _format_price, _normalize_price,
)


def draw_photos(canvas, draw, listing, y):
    """Фото-сетка до 6 шт. Возвращает новый y."""
    from PIL import Image, ImageDraw

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
        y = gy + rows * (cell_h + gap) - gap + 20
    return y


def draw_price(draw, listing, y):
    """Цена и цена за м². Возвращает новый y."""
    # ---------- Цена ----------
    draw.line([(PAD, y), (W - PAD, y)], fill=LINE, width=2)
    y += 22
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
    y = bb[3] + 24
    return y


def draw_params(draw, listing, y):
    """Карточки параметров. Возвращает новый y."""
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
        pcell_h = 76
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
        y = y + prows * (pcell_h + pgap) - pgap + 24
    return y


def draw_utilities(draw, listing, y, content_bottom_limit):
    """Список коммуникаций. Возвращает новый y."""
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
        y += 36
        ux, uy = PAD, y
        row_h = 34
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
        y = uy + row_h + 14
    return y


def draw_description(draw, listing, y, content_bottom_limit):
    """Описание, обрезанное по месту до низа страницы. Возвращает новый y."""
    # ---------- Описание (ограничено 1500 символами, крупный шрифт) ----------
    # Реальная обрезка по месту на странице (ниже) сработает раньше этого лимита,
    # если текста не хватает до низа — так не остаётся пустого места внизу.
    description = (listing.get('description') or '').strip()
    if len(description) > 1500:
        description = description[:1500].rstrip() + '…'
    if description and y < content_bottom_limit - 60:
        draw.text((PAD, y), "Описание", font=_font('Montserrat-ExtraBold.ttf', 26), fill=TEXT_DARK)
        y += 34

        font_desc = _font('IBMPlexSans-Regular.ttf', 23)
        line_h = 33
        para_gap = 11
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
        truncated = cut_at < len(all_lines)
        if truncated:
            all_lines = all_lines[:cut_at]
            for i in range(len(all_lines) - 1, -1, -1):
                if all_lines[i] != '':
                    all_lines[i] = _ellipsize(all_lines[i], font_desc, W - 2 * PAD, draw)
                    break

        # Растягиваем межстрочные интервалы, чтобы последняя строка доходила ровно
        # до нижнего края страницы (без остаточного зазора) — актуально когда текст
        # обрезан по месту и стандартный шаг не попадает точно в границу.
        steps = [para_gap if ln == '' else line_h for ln in all_lines]
        leftover = available_h - sum(steps)
        if truncated and steps and leftover > 0:
            extra_per_step = leftover / len(steps)
            steps = [s + extra_per_step for s in steps]

        for ln, step in zip(all_lines, steps):
            if ln == '':
                y += step
                continue
            draw.text((PAD, y), ln, font=font_desc, fill=(60, 68, 80))
            y += step
    return y
