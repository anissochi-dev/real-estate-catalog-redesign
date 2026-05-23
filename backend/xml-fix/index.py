"""
Business: Исправление синтаксических ошибок XML перед парсингом (неэкранированные &, <, >, BOM, кодировки, управляющие символы)
Args: event с httpMethod (POST), body {xml: string, encoding?: string}; context
Returns: HTTP-ответ {fixed_xml, report: {original_errors, corrections_applied, status}}
"""

import json
import re
import base64
from typing import Optional

try:
    import chardet
    HAS_CHARDET = True
except ImportError:
    HAS_CHARDET = False

import xml.etree.ElementTree as ET


CONTROL_CHARS_RE = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F]')
XML_DECL_RE = re.compile(r'^<\?xml[^?]*\?>', re.IGNORECASE)
CDATA_RE = re.compile(r'<!\[CDATA\[.*?\]\]>', re.DOTALL)
TAG_RE = re.compile(r'<(/?)([A-Za-z_][\w.-]*)((?:\s+[^<>]*?)?)\s*(/?)>')
KNOWN_ENTITIES_RE = re.compile(r'&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);')


def _ok(body: dict, status: int = 200) -> dict:
    return {
        'statusCode': status,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps(body, ensure_ascii=False),
    }


def _detect_encoding(raw: bytes) -> str:
    if raw.startswith(b'\xef\xbb\xbf'):
        return 'utf-8'
    if raw.startswith(b'\xff\xfe') or raw.startswith(b'\xfe\xff'):
        return 'utf-16'
    head = raw[:200].decode('ascii', errors='ignore')
    m = re.search(r'encoding=["\']([^"\']+)["\']', head)
    if m:
        return m.group(1).lower()
    if HAS_CHARDET:
        guess = chardet.detect(raw)
        if guess and guess.get('encoding'):
            return guess['encoding'].lower()
    return 'utf-8'


def _strip_bom_and_prefix(text: str, errors: list, fixes: list) -> str:
    if text.startswith('\ufeff'):
        errors.append('BOM found at start of file')
        fixes.append('Removed BOM marker')
        text = text.lstrip('\ufeff')
    stripped = text.lstrip()
    if stripped != text:
        leading = text[:len(text) - len(stripped)]
        if any(c not in ' \t\r\n' for c in leading):
            errors.append('Garbage before XML declaration')
            fixes.append('Stripped non-whitespace prefix')
        else:
            errors.append('Whitespace before XML declaration')
            fixes.append('Stripped leading whitespace')
        text = stripped
    return text


def _ensure_declaration(text: str, encoding: str, errors: list, fixes: list) -> str:
    if not XML_DECL_RE.match(text):
        errors.append('Missing or invalid XML declaration')
        fixes.append(f'Added <?xml version="1.0" encoding="{encoding}"?>')
        text = f'<?xml version="1.0" encoding="{encoding}"?>\n' + text
    return text


def _remove_control_chars(text: str, errors: list, fixes: list) -> str:
    matches = CONTROL_CHARS_RE.findall(text)
    if matches:
        errors.append(f'Found {len(matches)} forbidden control character(s)')
        fixes.append('Removed control characters (\\x00-\\x1F except \\t\\n\\r)')
        text = CONTROL_CHARS_RE.sub('', text)
    return text


def _split_cdata(text: str):
    parts = []
    last = 0
    for m in CDATA_RE.finditer(text):
        parts.append(('text', text[last:m.start()]))
        parts.append(('cdata', m.group(0)))
        last = m.end()
    parts.append(('text', text[last:]))
    return parts


def _fix_ampersands(segment: str, errors: list, fixes: list) -> str:
    def repl(m):
        if KNOWN_ENTITIES_RE.match(m.group(0)):
            return m.group(0)
        return '&amp;'
    new = re.sub(r'&(?![a-zA-Z#]+;)', '&amp;', segment)
    if new != segment:
        errors.append("Unescaped '&' character(s) found")
        fixes.append("Replaced bare '&' with '&amp;'")
    return new


def _fix_stray_lt_gt(segment: str, errors: list, fixes: list) -> str:
    """Экранирует одиночные < и > внутри текстовых узлов, не ломая валидные теги."""
    result = []
    i = 0
    n = len(segment)
    fixed_lt = 0
    fixed_gt = 0
    while i < n:
        ch = segment[i]
        if ch == '<':
            m = TAG_RE.match(segment, i)
            if m:
                result.append(m.group(0))
                i = m.end()
                continue
            if segment.startswith('<!--', i):
                end = segment.find('-->', i + 4)
                if end != -1:
                    result.append(segment[i:end + 3])
                    i = end + 3
                    continue
            if segment.startswith('<?', i):
                end = segment.find('?>', i + 2)
                if end != -1:
                    result.append(segment[i:end + 2])
                    i = end + 2
                    continue
            if segment.startswith('<!', i):
                end = segment.find('>', i + 2)
                if end != -1:
                    result.append(segment[i:end + 1])
                    i = end + 1
                    continue
            result.append('&lt;')
            fixed_lt += 1
            i += 1
        else:
            result.append(ch)
            i += 1
    out = ''.join(result)
    if fixed_lt:
        errors.append(f"Unescaped '<' character(s): {fixed_lt}")
        fixes.append("Escaped stray '<' as '&lt;'")
    if fixed_gt:
        errors.append(f"Unescaped '>' character(s): {fixed_gt}")
        fixes.append("Escaped stray '>' as '&gt;'")
    return out


def _fix_text_segments(text: str, errors: list, fixes: list) -> str:
    parts = _split_cdata(text)
    out = []
    for kind, seg in parts:
        if kind == 'cdata':
            out.append(seg)
        else:
            seg = _fix_ampersands(seg, errors, fixes)
            seg = _fix_stray_lt_gt(seg, errors, fixes)
            out.append(seg)
    return ''.join(out)


def fix_malformed_xml_text(raw: bytes, declared_encoding: Optional[str] = None) -> dict:
    errors: list = []
    fixes: list = []

    enc = declared_encoding or _detect_encoding(raw)
    try:
        text = raw.decode(enc, errors='replace')
    except (LookupError, UnicodeDecodeError):
        errors.append(f'Unknown or broken encoding: {enc}')
        fixes.append('Fell back to UTF-8 with replacement')
        text = raw.decode('utf-8', errors='replace')
        enc = 'utf-8'

    text = _strip_bom_and_prefix(text, errors, fixes)
    text = _remove_control_chars(text, errors, fixes)
    text = _fix_text_segments(text, errors, fixes)
    text = _ensure_declaration(text, enc, errors, fixes)

    status = 'success'
    parsed_ok = False
    try:
        ET.fromstring(text.encode(enc, errors='replace'))
        parsed_ok = True
    except ET.ParseError as e:
        errors.append(f'Residual parse error: {e}')
        status = 'partial'

    return {
        'fixed_xml': text,
        'encoding': enc,
        'report': {
            'original_errors': errors,
            'corrections_applied': fixes,
            'status': status,
            'parsed_ok': parsed_ok,
        },
    }


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _ok({'error': 'Method not allowed'}, 405)

    body = json.loads(event.get('body') or '{}')
    encoding = body.get('encoding')

    if body.get('xml_base64'):
        raw = base64.b64decode(body['xml_base64'])
    else:
        raw = (body.get('xml') or '').encode('utf-8')

    if not raw:
        return _ok({'error': 'Empty XML input'}, 400)

    result = fix_malformed_xml_text(raw, encoding)
    return _ok(result)