/** Форматирование дат и чисел для интерфейса (локаль ru-RU). */

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const timeWithSeconds = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** «24 октября, 10:00» */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dayMonth.format(date)}, ${time.format(date)}`;
}

/** «24 октября 2025, 10:00» */
export function formatDateTimeFull(iso: string): string {
  const date = new Date(iso);
  return `${dayMonthYear.format(date).replace(' г.', '')}, ${time.format(date)}`;
}

/** «24 октября 2025» */
export function formatDate(iso: string): string {
  return dayMonthYear.format(new Date(iso)).replace(' г.', '');
}

/** «10:14» */
export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

/** «10:14:02» */
export function formatTimeWithSeconds(iso: string): string {
  return timeWithSeconds.format(new Date(iso));
}

/** «Сегодня», «Завтра», «Через 4 дня», «Вчера», «5 дней назад». */
export function formatRelativeDay(iso: string): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Завтра';
  if (days === -1) return 'Вчера';
  if (days > 1) return `Через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
  return `${-days} ${plural(-days, ['день', 'дня', 'дней'])} назад`;
}

/** plural(5, ['место', 'места', 'мест']) → «мест» */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Инициалы для аватара: «Алексей Борисов» → «АБ». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Значение для <input type="date"> / <input type="time"> из ISO и обратно. */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fromDateTimeInputs(date: string, timeValue: string): string {
  if (!date) return '';
  return new Date(`${date}T${timeValue || '00:00'}`).toISOString();
}
