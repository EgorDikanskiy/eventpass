/**
 * Доменные типы (DTO), которыми фронтенд обменивается с API.
 *
 * Это контракт между фронтом и бэком: моковая и HTTP-реализации API
 * возвращают ровно эти структуры. Если ответы реального бэкенда будут
 * отличаться — преобразование делается в `api/http/mappers.ts`,
 * а не в компонентах.
 */

/** ISO-строка даты и времени, например `2026-10-24T10:00:00+03:00`. */
export type IsoDateTime = string;

// ---------- Пользователь и сессия ----------

export interface User {
  id: string;
  /** Короткий публичный ID, по которому организатор выдаёт права волонтёра (`482193`). */
  publicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  /** Вуз / компания — подставляется в анкеты. */
  organization: string | null;
  emailVerified: boolean;
  notificationsEnabled: boolean;
}

export interface Session {
  token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  consentAccepted: boolean;
  fullName: string;
  email: string;
  password: string;
}

export type UpdateProfileRequest = Partial<
  Pick<User, 'fullName' | 'email' | 'phone' | 'organization' | 'notificationsEnabled'>
>;

// ---------- Мероприятие ----------

export type EventStatus = 'draft' | 'published' | 'live' | 'finished';

export type PriceType = 'free' | 'paid';

export interface EventSection {
  id: string;
  title: string;
  /** Время в свободной форме: «10:30 — 13:00». */
  time: string;
}

export type QuestionType = 'text' | 'textarea' | 'email' | 'tel' | 'number' | 'date' | 'choice' | 'select' | 'multiple' | 'checkbox';

export const OPTION_QUESTION_TYPES: readonly QuestionType[] = ['choice', 'select', 'multiple'];

export interface QuestionOption {
  value: string;
  label: string;
  hint?: string | null;
}

/** Вопрос анкеты, который организатор добавил в конструкторе. */
export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  placeholder?: string | null;
  help?: string | null;
  options?: QuestionOption[] | null;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  startsAt: IsoDateTime | null;
  location: string;
  /** Зона прохода / КПП, если есть. */
  checkpoint?: string;
  capacity: number | null;
  registeredCount: number;
  checkedInCount: number;
}

export interface EventDetails extends EventSummary {
  description: string;
  category: string;
  priceType: PriceType;
  coverUrl: string | null;
  coverCaption?: string;
  coverBadge?: string;
  sections: EventSection[];
  questions: Question[];
  organizerId: string;
}

/** Что текущий пользователь может на странице мероприятия. */
export interface EventViewerContext {
  /** Билет текущего пользователя на это мероприятие, если он уже зарегистрирован. */
  ticketId: string | null;
  isOrganizer: boolean;
  isVolunteer: boolean;
}

export interface PublicEventResponse {
  event: EventDetails;
  viewer: EventViewerContext;
}

export interface EventInput {
  title: string;
  description: string;
  startsAt: IsoDateTime | null;
  location: string;
  capacity: number | null;
  priceType: PriceType;
  questions: Question[];
}

/** Вкладки экрана «Мои мероприятия». */
export type MyEventsTab = 'organizing' | 'volunteering' | 'drafts';

export interface MyEventsCounters {
  organizing: number;
  volunteering: number;
  drafts: number;
}

export interface MyEventsResponse {
  items: EventSummary[];
  counters: MyEventsCounters;
  roles: ('organizer' | 'volunteer')[];
}

// ---------- Регистрация и билеты ----------

export type TicketStatus = 'active' | 'used' | 'cancelled';

/** Итог посещения для вкладки «Прошедшие». */
export type AttendanceResult = 'attended' | 'missed' | 'cancelled';

export interface Ticket {
  id: string;
  /** Номер билета для людей: `EVT-849102`. */
  code: string;
  /** Уникальный токен, который зашит в QR. Персональных данных в нём нет. */
  qrToken: string;
  status: TicketStatus;
  holderName: string;
  holderEmail: string;
  category: string;
  zone: string;
  createdAt: IsoDateTime;
  checkedInAt: IsoDateTime | null;
  event: EventSummary & { category: string };
}

export type Answer = string | string[] | boolean;
export type Answers = Record<string, Answer>;

export interface GuestContacts {
  fullName: string;
  email: string;
  phone: string;
}

export interface RegisterForEventRequest {
  consentAccepted: boolean;
  answers: Answers;
  /** Заполняется только гостем (без аккаунта). Авторизованный берётся из профиля. */
  guest?: GuestContacts;
}

export interface RegisterForEventResponse {
  ticket: Ticket;
  /** Для гостя: аккаунт создан автоматически, в письме ссылка на подтверждение. */
  accountCreated: boolean;
  accessToken?: string | null;
}

export type TicketsScope = 'upcoming' | 'past';

export interface MyTicketsResponse {
  items: Ticket[];
  counters: Record<TicketsScope, number>;
}

// ---------- Организатор: дашборд, участники, волонтёры ----------

export type AttendeeStatus = 'present' | 'expected' | 'cancelled';

export interface Attendee {
  ticketId: string;
  ticketCode: string;
  fullName: string;
  email: string;
  status: AttendeeStatus;
  checkedInAt: IsoDateTime | null;
  answers: Answers;
}

export interface DashboardStats {
  registered: number;
  capacity: number;
  checkedIn: number;
  notCheckedIn: number;
}

export interface AttendeesQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Volunteer {
  userId: string;
  publicId: string;
  fullName: string;
  email: string;
  grantedAt: IsoDateTime;
}

export interface GrantVolunteerRequest {
  /** Email или публичный ID пользователя. */
  identifier: string;
}

// ---------- Сканер ----------

export type ScanResultType = 'allowed' | 'already_used' | 'invalid';

export interface ScanResult {
  result: ScanResultType;
  /** Пояснение для «недействителен»: не найден / отменён / чужое мероприятие. */
  reason?: string;
  ticketCode?: string;
  holderName?: string;
  category?: string;
  /** Время текущего (для allowed) или первого (для already_used) прохода. */
  checkedInAt?: IsoDateTime;
  checkedInBy?: string;
}

export interface ScanLogItem {
  id: string;
  scannedAt: IsoDateTime;
  result: ScanResultType;
  holderName: string | null;
  ticketCode: string | null;
  note: string;
}

export interface ScannerInfo {
  event: EventSummary;
  /** Кем сканирует текущий пользователь. */
  viewerRole: 'organizer' | 'volunteer';
  /** Сколько билетов проверил текущий пользователь. */
  checkedByMe: number;
  recent: ScanLogItem[];
}
