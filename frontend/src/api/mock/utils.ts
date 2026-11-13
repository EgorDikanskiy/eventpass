import { apiConfig } from '../config';

/** Имитация сетевой задержки, чтобы были видны состояния загрузки. */
export function delay(ms = apiConfig.mockDelay): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Номер билета вида EVT-849102. */
export function ticketCode(): string {
  return `EVT-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** Токен для QR: случайная строка без персональных данных. */
export function qrToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ep1.${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function publicId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Дата относительно «сейчас»: через `days` дней в `hh:mm` по локальному времени. */
export function relativeDate(days: number, hours: number, minutes = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

export function slugify(title: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
    л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const base = title
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'event'}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Глубокая копия, чтобы компоненты не могли изменить «базу» по ссылке. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
