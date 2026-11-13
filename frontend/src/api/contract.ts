import type {
  Attendee,
  AttendeesQuery,
  DashboardStats,
  EventDetails,
  EventInput,
  GrantVolunteerRequest,
  LoginRequest,
  MyEventsResponse,
  MyEventsTab,
  MyTicketsResponse,
  Paginated,
  PublicEventResponse,
  RegisterForEventRequest,
  RegisterForEventResponse,
  ScanResult,
  ScannerInfo,
  Session,
  SignUpRequest,
  Ticket,
  TicketsScope,
  UpdateProfileRequest,
  User,
  Volunteer,
} from './types';

/**
 * Единый контракт доступа к данным.
 *
 * Компоненты и хуки знают только этот интерфейс. Реализаций две:
 *  - `mock/mockApi.ts` — данные в памяти + localStorage, бэкенд не нужен;
 *  - `http/httpApi.ts` — REST-запросы к настоящему бэкенду.
 * Выбор — переменной окружения `VITE_API_MODE` (см. `api/index.ts`).
 *
 * Рядом с каждым методом указан REST-эндпоинт, который ожидает HTTP-реализация.
 * Полное описание — в `docs/API.md`.
 */
export interface Api {
  auth: {
    /** POST /auth/login */
    login(body: LoginRequest): Promise<Session>;
    /** POST /auth/register */
    signUp(body: SignUpRequest): Promise<Session>;
    /** POST /auth/logout */
    logout(): Promise<void>;
    /** POST /auth/resend-verification */
    resendVerification(email: string): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    useEmailLink(token: string, password?: string): Promise<void>;
  };

  profile: {
    /** GET /me */
    getMe(): Promise<User>;
    /** PATCH /me */
    update(body: UpdateProfileRequest): Promise<User>;
    /** DELETE /me */
    deleteAccount(): Promise<void>;
  };

  events: {
    /** GET /events/{slug} — публичная страница, работает и без токена. */
    getPublic(slug: string): Promise<PublicEventResponse>;
    /** GET /events/by-id/{id} — для формы редактирования (только организатор). */
    getById(id: string): Promise<EventDetails>;
    /** GET /me/events?tab=organizing|volunteering|drafts */
    listMine(tab: MyEventsTab): Promise<MyEventsResponse>;
    /** POST /events — создать (черновик или сразу опубликовать). */
    create(body: EventInput, publish: boolean): Promise<EventDetails>;
    /** PATCH /events/{id} */
    update(id: string, body: EventInput): Promise<EventDetails>;
    /** POST /events/{id}/publish */
    publish(id: string): Promise<EventDetails>;
  };

  registrations: {
    /** POST /events/{eventId}/registrations — 409 EMAIL_TAKEN, если гость ввёл почту существующего аккаунта. */
    register(eventId: string, body: RegisterForEventRequest): Promise<RegisterForEventResponse>;
  };

  tickets: {
    /** GET /me/tickets?scope=upcoming|past */
    listMine(scope: TicketsScope): Promise<MyTicketsResponse>;
    /** GET /tickets/{id} (для гостя — с ?token=) */
    getById(id: string, accessToken?: string): Promise<Ticket>;
    /** POST /tickets/{id}/cancel */
    cancel(id: string): Promise<Ticket>;
    downloadPdf(id: string, accessToken?: string): Promise<Blob>;
  };

  organizer: {
    /** GET /events/{id}/stats */
    getStats(eventId: string): Promise<DashboardStats>;
    /** GET /events/{id}/attendees?search=&page=&pageSize= */
    listAttendees(eventId: string, query: AttendeesQuery): Promise<Paginated<Attendee>>;
    /** GET /events/{id}/attendees/export — файл (CSV/XLSX). */
    exportAttendees(eventId: string): Promise<Blob>;
    /** GET /events/{id}/volunteers */
    listVolunteers(eventId: string): Promise<Volunteer[]>;
    /** POST /events/{id}/volunteers */
    grantVolunteer(eventId: string, body: GrantVolunteerRequest): Promise<Volunteer>;
    /** DELETE /events/{id}/volunteers/{userId} */
    revokeVolunteer(eventId: string, userId: string): Promise<void>;
  };

  scanner: {
    /** GET /events/{id}/scanner — 403, если нет прав организатора/волонтёра. */
    getInfo(eventId: string): Promise<ScannerInfo>;
    /** POST /events/{id}/scan — проверка выполняется на сервере. */
    scan(eventId: string, code: string): Promise<ScanResult>;
  };
}
