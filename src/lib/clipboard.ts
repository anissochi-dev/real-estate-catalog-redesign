/**
 * Копирует текст в буфер обмена.
 * 1) Clipboard API; 2) запасной способ через скрытое поле и execCommand('copy').
 * Скрытое поле кладётся внутрь `container` (если передан) — иначе в модальных окнах
 * ловушка фокуса не даёт выделить текст и копирование молча не срабатывает.
 */
export async function copyText(text: string, container?: HTMLElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем запасной способ */
  }
  try {
    const host = container || document.body;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    host.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    host.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default copyText;
