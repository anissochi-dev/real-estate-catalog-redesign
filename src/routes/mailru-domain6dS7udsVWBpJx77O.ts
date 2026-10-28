import { createFileRoute } from '@tanstack/react-router';

// Файл подтверждения домена Mail.ru. Файл без расширения в public/ хостинг не отдаёт,
// поэтому дублируем его маршрутом с тем же содержимым.
export const Route = createFileRoute('/mailru-domain6dS7udsVWBpJx77O')({
  server: {
    handlers: {
      GET: () => new Response('mailru-домен: 6dS7udsVWBpJx77O', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    },
  },
});
