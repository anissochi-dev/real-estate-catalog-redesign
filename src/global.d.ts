// Глобальные типы для сторонних API, подключаемых динамически в рантайме.
// Используется any для упрощения работы с динамически загружаемыми библиотеками.

/* eslint-disable @typescript-eslint/no-explicit-any */
export {};

declare global {
  interface Window {
    ymaps?: any;
    ym?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// elementtiming — стандартный HTML-атрибут (Element Timing API) для замера LCP,
// но в типах React его нет — добавляем через module augmentation.
declare module 'react' {
  interface HTMLAttributes<T> {
    elementtiming?: string;
  }
}