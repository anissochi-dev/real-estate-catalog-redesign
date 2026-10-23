"""
Генерация JPG-презентации объекта (формат A4, 1240x1754px, 150dpi) для соцсетей/статусов/клиентов.
Рисует: шапку (лого слева, телефон по центру, домен+номер объекта справа), заголовок с QR-кодом
на страницу объекта справа от названия, сетку из фото, цену, параметры, коммуникации и описание.
Синего подвала больше нет — вся площадь страницы отдана под контент.
"""
import io

from pres_common import W, H, WHITE, BOTTOM_MARGIN
from pres_top import draw_header, draw_title_qr
from pres_body import draw_photos, draw_price, draw_params, draw_utilities, draw_description


def generate(listing: dict, company: dict) -> bytes:
    """
    listing: dict с полями id, title, address, district, price, deal, area,
             land_area, type/category, condition, ceiling_height, parking,
             total_floors, utilities (csv string), description, images (list[str]), slug
    company: dict с полями logo_url, company_phone, site_url
    Возвращает JPEG bytes готовой презентации.
    """
    from PIL import Image, ImageDraw

    canvas = Image.new('RGB', (W, H), WHITE)
    draw = ImageDraw.Draw(canvas)
    content_bottom_limit = H - BOTTOM_MARGIN

    site_url = (company.get('site_url') or '').rstrip('/')
    site_label = site_url.replace('https://', '').replace('http://', '') if site_url else ''

    y = draw_header(canvas, draw, listing, company, site_label)
    y = draw_title_qr(canvas, draw, listing, site_url, y)
    y = draw_photos(canvas, draw, listing, y)
    y = draw_price(draw, listing, y)
    y = draw_params(draw, listing, y)
    y = draw_utilities(draw, listing, y, content_bottom_limit)
    y = draw_description(draw, listing, y, content_bottom_limit)

    # Подвал убран полностью — QR-код и домен уже выведены в шапке/у заголовка выше.

    out = io.BytesIO()
    canvas.convert('RGB').save(out, format='JPEG', quality=90, optimize=True)
    return out.getvalue()
