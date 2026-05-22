/**
 * Перевод серверных и сетевых ошибок в понятные для пользователя сообщения.
 * Используется в req() в adminApi.ts — автоматически показывает toast при любой ошибке API.
 */

import { toast } from 'sonner';

interface TranslatedError {
  /** Заголовок toast — короткая суть */
  title: string;
  /** Подсказка что делать пользователю */
  hint: string;
  /** Технический текст оригинала (для F12) */
  raw: string;
}

const PATTERNS: Array<{ match: RegExp; title: string; hint: string }> = [
  // HTTP коды
  { match: /HTTP 401|Требуется авторизация|Unauthorized/i,
    title: 'Нужно войти заново',
    hint: 'Сессия истекла — войдите в систему ещё раз.' },
  { match: /HTTP 403|Только для admin|Нет доступа|Forbidden|Недостаточно прав/i,
    title: 'Нет прав на это действие',
    hint: 'Обратитесь к администратору, чтобы получить доступ.' },
  { match: /HTTP 404|Не найдено|Not Found/i,
    title: 'Запись не найдена',
    hint: 'Возможно, её уже удалили — обновите страницу.' },
  { match: /HTTP 409|FOREIGN KEY|ForeignKeyViolation|violates foreign key|ссылаются связанные|ссылаются другие/i,
    title: 'Нельзя удалить — есть связанные записи',
    hint: 'Удалите сначала связанные сделки, заявки или комментарии.' },
  { match: /HTTP 429|превышен лимит|too many/i,
    title: 'Слишком много запросов',
    hint: 'Подождите минуту и попробуйте снова.' },
  { match: /HTTP 503|ServiceUnavailable/i,
    title: 'Сервис временно недоступен',
    hint: 'Подождите немного и повторите попытку.' },
  { match: /HTTP 5\d\d/i,
    title: 'Ошибка сервера',
    hint: 'Мы уже знаем о проблеме — попробуйте ещё раз через минуту.' },

  // YandexGPT
  { match: /YandexGPT.*401|отклонил ключ|YandexGPT не настроен/i,
    title: 'ИИ не настроен',
    hint: 'Зайдите в Настройки → Интеграции и проверьте API-ключ Yandex.' },
  { match: /YandexGPT.*403/i,
    title: 'У ИИ нет прав',
    hint: 'Сервисному аккаунту Yandex нужно выдать роль ai.languageModels.user.' },
  { match: /YandexGPT.*429/i,
    title: 'ИИ перегружен',
    hint: 'Подождите минуту — слишком много запросов к Yandex.' },
  { match: /YandexGPT вернул пустой|вернул некорректный/i,
    title: 'ИИ вернул пустой ответ',
    hint: 'Попробуйте переформулировать запрос или повторите чуть позже.' },

  // Сетевые
  { match: /Failed to fetch|Load failed|NetworkError|net::ERR/i,
    title: 'Нет связи с сервером',
    hint: 'Проверьте интернет и попробуйте ещё раз.' },
  { match: /timeout|таймаут/i,
    title: 'Превышено время ожидания',
    hint: 'Сервер слишком долго отвечает — попробуйте ещё раз.' },

  // Валидация
  { match: /обязател|required|не указан|empty|пуст/i,
    title: 'Заполните обязательные поля',
    hint: 'Проверьте форму — какое-то поле осталось пустым.' },
  { match: /уже существует|duplicate|UniqueViolation/i,
    title: 'Такая запись уже есть',
    hint: 'Используйте другое значение или найдите существующую.' },
  { match: /некорректн|invalid|неверн/i,
    title: 'Неверный формат данных',
    hint: 'Проверьте, что данные введены правильно.' },

  // База данных
  { match: /database|psycopg|connection|подключ/i,
    title: 'Проблема с базой данных',
    hint: 'Подождите минуту и повторите — мы уже разбираемся.' },
];

export function translateError(raw: unknown): TranslatedError {
  const text = raw instanceof Error ? raw.message : String(raw || '');
  for (const p of PATTERNS) {
    if (p.match.test(text)) {
      return { title: p.title, hint: p.hint, raw: text };
    }
  }
  // По умолчанию используем оригинал, но очищаем от технических деталей
  const cleaned = text
    .replace(/HTTP \d+/g, '')
    .replace(/^\s*[:\-—]\s*/, '')
    .trim();
  return {
    title: cleaned || 'Что-то пошло не так',
    hint: 'Попробуйте обновить страницу или повторите действие.',
    raw: text,
  };
}

/** Показать toast с переведённой ошибкой. */
export function showError(raw: unknown) {
  const t = translateError(raw);
  toast.error(t.title, {
    description: t.hint,
    duration: 6000,
  });
  // Для отладки кладём оригинал в консоль
   
  console.error('[API ERROR]', t.raw);
}
