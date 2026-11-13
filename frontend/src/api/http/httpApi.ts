import type { Api } from '../contract';
import { tokenStorage } from '../tokenStorage';
import type {
  Attendee,
  DashboardStats,
  EventDetails,
  MyEventsResponse,
  MyTicketsResponse,
  Paginated,
  PublicEventResponse,
  RegisterForEventResponse,
  ScanResult,
  ScannerInfo,
  Session,
  Ticket,
  User,
  Volunteer,
} from '../types';
import { request } from './client';

/**
 * Реализация API поверх REST.
 *
 * Пути и формы ответов — предварительные (см. docs/API.md). Когда появится
 * документация бэкенда, правки делаются здесь: поменять путь или добавить
 * преобразование ответа к доменному типу. Остальной код не меняется.
 */
export const httpApi: Api = {
  auth: {
    async login(body) {
      const session = await request<Session>('/auth/login', { method: 'POST', body });
      tokenStorage.set(session.token);
      return session;
    },
    async signUp(body) {
      const session = await request<Session>('/auth/register', { method: 'POST', body });
      tokenStorage.set(session.token);
      return session;
    },
    async logout() {
      try {
        await request<void>('/auth/logout', { method: 'POST' });
      } finally {
        tokenStorage.clear();
      }
    },
    resendVerification: (email) => request<void>('/auth/resend-verification', { method: 'POST', body: { email } }),
    requestPasswordReset: (email) => request<void>('/auth/forgot-password', { method: 'POST', body: { email } }),
    useEmailLink: (token, password) => request<void>('/auth/email-link', { method: 'POST', body: { token, password } }),
  },

  profile: {
    getMe: () => request<User>('/me'),
    update: (body) => request<User>('/me', { method: 'PATCH', body }),
    async deleteAccount() {
      await request<void>('/me', { method: 'DELETE' });
      tokenStorage.clear();
    },
  },

  events: {
    getPublic: (slug) => request<PublicEventResponse>(`/events/${encodeURIComponent(slug)}`),
    getById: (id) => request<EventDetails>(`/events/by-id/${id}`),
    listMine: (tab) =>
      request<MyEventsResponse>('/me/events', { query: { tab } }),
    create: (body, publish) => request<EventDetails>('/events', { method: 'POST', body: { ...body, publish } }),
    update: (id, body) => request<EventDetails>(`/events/${id}`, { method: 'PATCH', body }),
    publish: (id) => request<EventDetails>(`/events/${id}/publish`, { method: 'POST' }),
  },

  registrations: {
    register: (eventId, body) =>
      request<RegisterForEventResponse>(`/events/${eventId}/registrations`, { method: 'POST', body }),
  },

  tickets: {
    listMine: (scope) => request<MyTicketsResponse>('/me/tickets', { query: { scope } }),
    getById: (id, accessToken) => request<Ticket>(`/tickets/${id}`, { query: { token: accessToken } }),
    cancel: (id) => request<Ticket>(`/tickets/${id}/cancel`, { method: 'POST' }),
    downloadPdf: (id, accessToken) =>
      request<Blob>(`/tickets/${id}/pdf`, { query: { token: accessToken }, responseType: 'blob' }),
  },

  organizer: {
    getStats: (eventId) => request<DashboardStats>(`/events/${eventId}/stats`),
    listAttendees: (eventId, query) =>
      request<Paginated<Attendee>>(`/events/${eventId}/attendees`, { query: { ...query } }),
    exportAttendees: (eventId) =>
      request<Blob>(`/events/${eventId}/attendees/export`, { responseType: 'blob' }),
    listVolunteers: (eventId) => request<Volunteer[]>(`/events/${eventId}/volunteers`),
    grantVolunteer: (eventId, body) =>
      request<Volunteer>(`/events/${eventId}/volunteers`, { method: 'POST', body }),
    revokeVolunteer: (eventId, userId) =>
      request<void>(`/events/${eventId}/volunteers/${userId}`, { method: 'DELETE' }),
  },

  scanner: {
    getInfo: (eventId) => request<ScannerInfo>(`/events/${eventId}/scanner`),
    scan: (eventId, code) => request<ScanResult>(`/events/${eventId}/scan`, { method: 'POST', body: { code } }),
  },
};
