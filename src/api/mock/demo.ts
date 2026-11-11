import { getDb } from './db';

/**
 * Подсказки для демонстрации сканера на моках: реальные коды билетов
 * этого мероприятия (активный и уже использованный) и заведомо неверный код.
 */
export function getDemoCodes(eventId: string): { code: string; label: string }[] {
  const tickets = getDb().tickets.filter((t) => t.eventId === eventId);
  const active = tickets.find((t) => t.status === 'active');
  const used = tickets.find((t) => t.status === 'used');
  const cancelled = tickets.find((t) => t.status === 'cancelled');
  return [
    active && { code: active.code, label: `${active.code} · ${active.holderName}` },
    used && { code: used.code, label: `${used.code} · уже прошёл` },
    cancelled && { code: cancelled.code, label: `${cancelled.code} · отменён` },
    { code: 'EVT-000000', label: 'EVT-000000 · не существует' },
  ].filter((item): item is { code: string; label: string } => !!item);
}
