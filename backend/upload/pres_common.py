"""
Общие константы, шрифты и вспомогательные функции для генерации JPG-презентации объекта.
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
BOTTOM_MARGIN = 0

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
