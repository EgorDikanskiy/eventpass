import type { AttendeesQuery, MyEventsTab, TicketsScope } from '@/api';

/**
 * Все ключи кэша TanStack Query в одном месте.
 * Инвалидация после мутаций делается по этим ключам.
 */
export const queryKeys = {
  me: ['me'] as const,
  publicEvent: (slug: string) => ['events', 'public', slug] as const,
  event: (id: string) => ['events', 'byId', id] as const,
  myEvents: (tab: MyEventsTab) => ['events', 'mine', tab] as const,
  myEventsAll: ['events', 'mine'] as const,
  myTickets: (scope: TicketsScope) => ['tickets', 'mine', scope] as const,
  ticketsAll: ['tickets'] as const,
  ticket: (id: string) => ['tickets', 'byId', id] as const,
  stats: (eventId: string) => ['organizer', eventId, 'stats'] as const,
  attendees: (eventId: string, query: AttendeesQuery) => ['organizer', eventId, 'attendees', query] as const,
  attendeesAll: (eventId: string) => ['organizer', eventId, 'attendees'] as const,
  volunteers: (eventId: string) => ['organizer', eventId, 'volunteers'] as const,
  scanner: (eventId: string) => ['scanner', eventId] as const,
};
