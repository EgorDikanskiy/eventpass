import { formatQuestionAnswer, validateQuestionAnswers } from '../questionAnswers';
import type { Api } from '../contract';
import { ApiError } from '../errors';
import { notifyUnauthorized, tokenStorage } from '../tokenStorage';
import type {
  Answers,
  Attendee,
  EventDetails,
  EventInput,
  EventStatus,
  EventSummary,
  ScanLogItem,
  ScanResult,
  Session,
  Ticket,
  User,
  Volunteer,
} from '../types';
import { getDb, saveDb, type DbEvent, type DbTicket, type DbUser } from './db';
import { clone, delay, publicId, qrToken, randomId, slugify, ticketCode } from './utils';

/**
 * Моковая реализация API. Ведёт себя как будущий сервер:
 * проверяет сессию и права, возвращает те же коды ошибок,
 * хранит изменения в localStorage. Компоненты не знают, что это моки.
 */

const MOCK_TOKEN_PREFIX = 'mock.';

// ---------- служебное: сессия и права ----------

function currentUser(): DbUser | null {
  const token = tokenStorage.get();
  if (!token?.startsWith(MOCK_TOKEN_PREFIX)) return null;
  const userId = token.slice(MOCK_TOKEN_PREFIX.length);
  return getDb().users.find((u) => u.id === userId) ?? null;
}

function requireUser(): DbUser {
  const user = currentUser();
  if (!user) {
    notifyUnauthorized();
    throw new ApiError('UNAUTHORIZED', 'Войдите, чтобы продолжить', 401);
  }
  return user;
}

function findEvent(id: string): DbEvent {
  const event = getDb().events.find((e) => e.id === id);
  if (!event) throw new ApiError('NOT_FOUND', 'Мероприятие не найдено', 404);
  return event;
}

function isVolunteer(eventId: string, userId: string): boolean {
  return getDb().volunteers.some((v) => v.eventId === eventId && v.userId === userId);
}

function requireOrganizer(eventId: string, publishedOnly = false): { user: DbUser; event: DbEvent } {
  const user = requireUser();
  const event = findEvent(eventId);
  if (event.organizerId !== user.id) {
    throw new ApiError('FORBIDDEN', 'Нет прав на это мероприятие', 403);
  }
  if (publishedOnly && event.status === 'draft') {
    throw new ApiError('FORBIDDEN', 'Раздел доступен после публикации мероприятия', 403);
  }
  return { user, event };
}

function requireScannerAccess(eventId: string): { user: DbUser; event: DbEvent } {
  const user = requireUser();
  const event = findEvent(eventId);
  if (event.organizerId !== user.id && !isVolunteer(eventId, user.id)) {
    throw new ApiError('FORBIDDEN', 'Права на сканирование отозваны или не выдавались', 403);
  }
  if (event.status === 'draft' || eventStatus(event) === 'finished') {
    throw new ApiError('FORBIDDEN', 'Сканер доступен только для действующего мероприятия', 403);
  }
  return { user, event };
}

// ---------- преобразование записей «базы» в DTO ----------

function toUser(user: DbUser): User {
  const { password: _password, ...rest } = user;
  void _password;
  return clone(rest);
}

function session(user: DbUser): Session {
  const token = `${MOCK_TOKEN_PREFIX}${user.id}`;
  tokenStorage.set(token);
  return { token, user: toUser(user) };
}

function eventStatus(event: DbEvent): EventStatus {
  if (event.status === 'draft') return 'draft';
  const start = new Date(event.startsAt).getTime();
  const end = start + event.durationHours * 3_600_000;
  const now = Date.now();
  if (now >= end) return 'finished';
  if (now >= start) return 'live';
  return 'published';
}

function eventTickets(eventId: string): DbTicket[] {
  return getDb().tickets.filter((t) => t.eventId === eventId);
}

function toSummary(event: DbEvent): EventSummary {
  const tickets = eventTickets(event.id).filter((t) => t.status !== 'cancelled');
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    status: eventStatus(event),
    startsAt: event.startsAt,
    location: event.location,
    checkpoint: event.checkpoint,
    capacity: event.capacity,
    registeredCount: tickets.length,
    checkedInCount: tickets.filter((t) => t.status === 'used').length,
  };
}

function toDetails(event: DbEvent): EventDetails {
  return clone({
    ...toSummary(event),
    description: event.description,
    category: event.category,
    priceType: event.priceType,
    coverUrl: event.coverUrl,
    coverCaption: event.coverCaption,
    coverBadge: event.coverBadge,
    sections: event.sections,
    questions: event.questions,
    organizerId: event.organizerId,
  });
}

function toTicket(ticket: DbTicket): Ticket {
  const event = findEvent(ticket.eventId);
  return clone({
    id: ticket.id,
    code: ticket.code,
    qrToken: ticket.qrToken,
    status: ticket.status,
    holderName: ticket.holderName,
    holderEmail: ticket.holderEmail,
    category: ticket.category,
    zone: ticket.zone,
    createdAt: ticket.createdAt,
    checkedInAt: ticket.checkedInAt,
    event: { ...toSummary(event), category: event.category },
  });
}

function toAttendee(ticket: DbTicket): Attendee {
  return {
    ticketId: ticket.id,
    ticketCode: ticket.code,
    fullName: ticket.holderName,
    email: ticket.holderEmail,
    status: ticket.status === 'used' ? 'present' : ticket.status === 'cancelled' ? 'cancelled' : 'expected',
    checkedInAt: ticket.checkedInAt,
    answers: clone(ticket.answers),
  };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function validateEventInput(body: EventInput): void {
  const fields: Record<string, string> = {};
  if (!body.title.trim()) fields.title = 'Укажите название';
  if (!body.location.trim()) fields.location = 'Укажите место';
  if (!body.startsAt || Number.isNaN(Date.parse(body.startsAt))) fields.startsAt = 'Укажите дату и время';
  if (!Number.isFinite(body.capacity) || body.capacity < 1) fields.capacity = 'Лимит должен быть больше нуля';
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Проверьте поля формы', 422, fields);
}

function categoryFromAnswers(event: DbEvent, answers: Answers): string {
  const choice = event.questions.find((q) => q.type === 'choice');
  const option = choice?.options?.find((o) => o.value === answers[choice.id]);
  return option?.label ?? 'Участник';
}

// ---------- реализация контракта ----------

export const mockApi: Api = {
  auth: {
    async login({ email, password }) {
      await delay();
      const user = getDb().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || !user.password || user.password !== password) {
        throw new ApiError('INVALID_CREDENTIALS', 'Неверная почта или пароль', 401);
      }
      return session(user);
    },

    async signUp({ fullName, email, password }) {
      await delay();
      const db = getDb();
      const normalized = email.trim().toLowerCase();
      const existing = db.users.find((u) => u.email.toLowerCase() === normalized);
      if (existing?.password) {
        throw new ApiError('EMAIL_TAKEN', 'Аккаунт с такой почтой уже есть — войдите', 409, {
          email: 'Почта уже зарегистрирована',
        });
      }
      if (password.length < 8) {
        throw new ApiError('VALIDATION', 'Пароль слишком короткий', 422, { password: 'Минимум 8 символов' });
      }
      // Аккаунт мог быть создан автоматически при регистрации гостем — «дозаводим» его.
      const user: DbUser = existing ?? {
        id: randomId('u'),
        publicId: publicId(),
        fullName: fullName.trim(),
        email: normalized,
        phone: null,
        organization: null,
        emailVerified: false,
        notificationsEnabled: true,
        password: null,
      };
      user.fullName = fullName.trim();
      user.password = password;
      if (!existing) db.users.push(user);
      saveDb();
      return session(user);
    },

    async logout() {
      await delay(100);
      tokenStorage.clear();
    },

    async resendVerification() {
      await delay();
    },

    async requestPasswordReset() {
      await delay();
    },

    async useEmailLink() {
      throw new ApiError('VALIDATION', 'Ссылка недействительна', 422);
    },
  },

  profile: {
    async getMe() {
      await delay(150);
      return toUser(requireUser());
    },

    async update(body) {
      await delay();
      const user = requireUser();
      if (body.email && body.email.toLowerCase() !== user.email.toLowerCase()) {
        const taken = getDb().users.some((u) => u.id !== user.id && u.email.toLowerCase() === body.email!.toLowerCase());
        if (taken) throw new ApiError('VALIDATION', 'Почта уже используется', 422, { email: 'Почта уже используется' });
      }
      Object.assign(user, body);
      saveDb();
      return toUser(user);
    },

    async deleteAccount() {
      await delay();
      const user = requireUser();
      const db = getDb();
      db.users = db.users.filter((u) => u.id !== user.id);
      db.tickets = db.tickets.filter((t) => t.userId !== user.id);
      db.volunteers = db.volunteers.filter((v) => v.userId !== user.id);
      saveDb();
      tokenStorage.clear();
    },
  },

  events: {
    async getPublic(slug) {
      await delay();
      const event = getDb().events.find((e) => e.slug === slug);
      if (!event || event.status === 'draft') throw new ApiError('NOT_FOUND', 'Мероприятие не найдено', 404);
      const user = currentUser();
      const ticket = user
        ? eventTickets(event.id).find((t) => t.userId === user.id && t.status !== 'cancelled')
        : undefined;
      return {
        event: toDetails(event),
        viewer: {
          ticketId: ticket?.id ?? null,
          isOrganizer: !!user && event.organizerId === user.id,
          isVolunteer: !!user && eventStatus(event) !== 'finished' && isVolunteer(event.id, user.id),
        },
      };
    },

    async getById(id) {
      await delay();
      return toDetails(requireOrganizer(id).event);
    },

    async listMine(tab) {
      await delay();
      const user = requireUser();
      const db = getDb();
      const own = db.events.filter((e) => e.organizerId === user.id);
      const organizing = own.filter((e) => e.status === 'published');
      const drafts = own.filter((e) => e.status === 'draft');
      const volunteering = db.events.filter(
        (e) => isVolunteer(e.id, user.id) && e.status === 'published' && eventStatus(e) !== 'finished',
      );
      const byDate = (a: DbEvent, b: DbEvent) => a.startsAt.localeCompare(b.startsAt);
      const list = { organizing, volunteering, drafts }[tab].sort(byDate);
      return {
        items: list.map(toSummary),
        roles: [...(own.length ? ['organizer' as const] : []), ...(volunteering.length ? ['volunteer' as const] : [])],
        counters: { organizing: organizing.length, volunteering: volunteering.length, drafts: drafts.length },
      };
    },

    async create(body, publish) {
      await delay();
      const user = requireUser();
      validateEventInput(body);
      const event: DbEvent = {
        id: randomId('e'),
        slug: slugify(body.title),
        title: body.title.trim(),
        description: body.description.trim(),
        category: 'Мероприятие',
        status: publish ? 'published' : 'draft',
        startsAt: body.startsAt,
        durationHours: 4,
        location: body.location.trim(),
        capacity: body.capacity,
        priceType: body.priceType,
        coverUrl: null,
        sections: [],
        questions: clone(body.questions),
        organizerId: user.id,
        createdAt: new Date().toISOString(),
      };
      getDb().events.push(event);
      saveDb();
      return toDetails(event);
    },

    async update(id, body) {
      await delay();
      const { event } = requireOrganizer(id);
      validateEventInput(body);
      Object.assign(event, {
        title: body.title.trim(),
        description: body.description.trim(),
        startsAt: body.startsAt,
        location: body.location.trim(),
        capacity: body.capacity,
        priceType: body.priceType,
        questions: clone(body.questions),
      });
      saveDb();
      return toDetails(event);
    },

    async publish(id) {
      await delay();
      const { event } = requireOrganizer(id);
      event.status = 'published';
      saveDb();
      return toDetails(event);
    },
  },

  registrations: {
    async register(eventId, { answers, guest }) {
      await delay(600);
      const db = getDb();
      const event = findEvent(eventId);
      if (event.status === 'draft') throw new ApiError('NOT_FOUND', 'Мероприятие не найдено', 404);

      const fields = validateQuestionAnswers(event.questions, answers);
      if (Object.keys(fields).length) {
        throw new ApiError('VALIDATION', 'Проверьте ответы анкеты', 422, fields);
      }

      const active = eventTickets(event.id).filter((t) => t.status !== 'cancelled');
      if (active.length >= event.capacity) throw new ApiError('EVENT_FULL', 'Свободных мест нет', 409);

      let user = currentUser();
      let accountCreated = false;

      if (!user) {
        if (!guest) throw new ApiError('UNAUTHORIZED', 'Войдите или заполните контакты', 401);
        const email = guest.email.trim().toLowerCase();
        const fields: Record<string, string> = {};
        if (!guest.fullName.trim()) fields.fullName = 'Укажите имя и фамилию';
        if (!/^\S+@\S+\.\S+$/.test(email)) fields.email = 'Проверьте почту';
        if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Проверьте поля формы', 422, fields);

        // Сценарий «почта уже зарегистрирована» → экран входа с подставленной почтой.
        if (db.users.some((u) => u.email.toLowerCase() === email)) {
          throw new ApiError('EMAIL_TAKEN', 'На эту почту уже есть аккаунт', 409);
        }
        user = {
          id: randomId('u'),
          publicId: publicId(),
          fullName: guest.fullName.trim(),
          email,
          phone: guest.phone.trim() || null,
          organization: null,
          emailVerified: false,
          notificationsEnabled: true,
          password: null,
        };
        db.users.push(user);
        accountCreated = true;
      } else if (active.some((t) => t.userId === user!.id)) {
        throw new ApiError('ALREADY_REGISTERED', 'Вы уже зарегистрированы на это мероприятие', 409);
      }

      const ticket: DbTicket = {
        id: randomId('t'),
        code: ticketCode(),
        qrToken: qrToken(),
        eventId: event.id,
        userId: user.id,
        holderName: user.fullName,
        holderEmail: user.email,
        status: 'active',
        category: categoryFromAnswers(event, answers),
        zone: event.checkpoint ? `Входная зона: ${event.checkpoint}` : 'Основной вход',
        answers: clone(answers),
        createdAt: new Date().toISOString(),
        checkedInAt: null,
        checkedInBy: null,
      };
      db.tickets.push(ticket);
      saveDb();
      return { ticket: toTicket(ticket), accountCreated };
    },
  },

  tickets: {
    async downloadPdf() {
      throw new ApiError('NOT_FOUND', 'PDF доступен в режиме HTTP', 404);
    },

    async listMine(scope) {
      await delay();
      const user = requireUser();
      const mine = getDb().tickets.filter((t) => t.userId === user.id);
      const isPast = (t: DbTicket) => eventStatus(findEvent(t.eventId)) === 'finished';
      const upcoming = mine
        .filter((t) => !isPast(t) && t.status !== 'cancelled')
        .sort((a, b) => findEvent(a.eventId).startsAt.localeCompare(findEvent(b.eventId).startsAt));
      // Отменённый билет на ещё не прошедшее мероприятие показываем в истории,
      // только если человек не зарегистрировался на него заново.
      const reRegistered = (t: DbTicket) =>
        mine.some((other) => other.eventId === t.eventId && other.status !== 'cancelled');
      const past = mine
        .filter((t) => isPast(t) || (t.status === 'cancelled' && !reRegistered(t)))
        .sort((a, b) => findEvent(b.eventId).startsAt.localeCompare(findEvent(a.eventId).startsAt));
      return {
        items: (scope === 'upcoming' ? upcoming : past).map(toTicket),
        counters: { upcoming: upcoming.length, past: past.length },
      };
    },

    async getById(id, accessToken) {
      await delay();
      const ticket = getDb().tickets.find((t) => t.id === id);
      if (!ticket) throw new ApiError('NOT_FOUND', 'Билет не найден', 404);
      const user = currentUser();
      const allowed = (user && ticket.userId === user.id) || (accessToken && accessToken === ticket.qrToken);
      if (!allowed) throw new ApiError('FORBIDDEN', 'Нет доступа к билету', 403);
      return toTicket(ticket);
    },

    async cancel(id) {
      await delay();
      const user = requireUser();
      const ticket = getDb().tickets.find((t) => t.id === id && t.userId === user.id);
      if (!ticket) throw new ApiError('NOT_FOUND', 'Билет не найден', 404);
      if (ticket.status === 'used') throw new ApiError('VALIDATION', 'Билет уже использован', 422);
      ticket.status = 'cancelled';
      saveDb();
      return toTicket(ticket);
    },
  },

  organizer: {
    async getStats(eventId) {
      await delay(200);
      const { event } = requireOrganizer(eventId, true);
      const active = eventTickets(event.id).filter((t) => t.status !== 'cancelled');
      const checkedIn = active.filter((t) => t.status === 'used').length;
      return {
        registered: active.length,
        capacity: event.capacity,
        checkedIn,
        notCheckedIn: active.length - checkedIn,
      };
    },

    async listAttendees(eventId, { search = '', page = 1, pageSize = 20 }) {
      await delay(250);
      requireOrganizer(eventId, true);
      const q = search.trim().toLowerCase();
      const items = eventTickets(eventId)
        .filter((t) => t.status !== 'cancelled')
        .filter(
          (t) =>
            !q ||
            t.holderName.toLowerCase().includes(q) ||
            t.holderEmail.toLowerCase().includes(q) ||
            t.code.toLowerCase().includes(q),
        )
        // Сначала последние чекины, потом ожидаемые
        .sort((a, b) => (b.checkedInAt ?? '').localeCompare(a.checkedInAt ?? ''));
      const start = (page - 1) * pageSize;
      return { items: items.slice(start, start + pageSize).map(toAttendee), total: items.length, page, pageSize };
    },

    async exportAttendees(eventId) {
      await delay();
      const { event } = requireOrganizer(eventId, true);
      const questions = event.questions;
      const header = ['Билет', 'ФИО', 'Email', 'Статус', 'Время чекина', ...questions.map((q) => q.label)];
      const rows = eventTickets(eventId).map((t) => {
        const attendee = toAttendee(t);
        const status = { present: 'Присутствует', expected: 'Ожидается', cancelled: 'Отменён' }[attendee.status];
        const answers = questions.map((question) => formatQuestionAnswer(question, t.answers[question.id]));
        return [t.code, t.holderName, t.holderEmail, status, t.checkedInAt ? formatTime(t.checkedInAt) : '', ...answers];
      });
      const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
      const csv = [header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
      // BOM, чтобы Excel правильно открыл кириллицу
      return new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    },

    async listVolunteers(eventId) {
      await delay();
      requireOrganizer(eventId, true);
      const db = getDb();
      return db.volunteers
        .filter((v) => v.eventId === eventId)
        .map((v): Volunteer | null => {
          const user = db.users.find((u) => u.id === v.userId);
          return user
            ? { userId: user.id, publicId: user.publicId, fullName: user.fullName, email: user.email, grantedAt: v.grantedAt }
            : null;
        })
        .filter((v): v is Volunteer => v !== null);
    },

    async grantVolunteer(eventId, { identifier }) {
      await delay();
      const { user: organizer, event } = requireOrganizer(eventId, true);
      if (eventStatus(event) === 'finished') throw new ApiError('FORBIDDEN', 'Мероприятие завершилось, выдача прав закрыта', 403);
      const db = getDb();
      const value = identifier.trim().replace(/^#/, '').toLowerCase();
      const user = db.users.find((u) => u.email.toLowerCase() === value || u.publicId === value);
      if (!user) {
        throw new ApiError('NOT_FOUND', 'Пользователь не найден. Попросите его зарегистрироваться в EventPass', 404, {
          identifier: 'Нет пользователя с такой почтой или ID',
        });
      }
      if (user.id === organizer.id) {
        throw new ApiError('VALIDATION', 'Организатор и так может сканировать билеты', 422, {
          identifier: 'Это вы — у организатора уже есть доступ к сканеру',
        });
      }
      if (isVolunteer(eventId, user.id)) {
        throw new ApiError('VALIDATION', 'Права уже выданы', 422, { identifier: 'Этот пользователь уже волонтёр' });
      }
      const grantedAt = new Date().toISOString();
      db.volunteers.push({ eventId, userId: user.id, grantedAt });
      saveDb();
      return { userId: user.id, publicId: user.publicId, fullName: user.fullName, email: user.email, grantedAt };
    },

    async revokeVolunteer(eventId, userId) {
      await delay();
      requireOrganizer(eventId, true);
      const db = getDb();
      db.volunteers = db.volunteers.filter((v) => !(v.eventId === eventId && v.userId === userId));
      saveDb();
    },
  },

  scanner: {
    async getInfo(eventId) {
      await delay(200);
      const { user, event } = requireScannerAccess(eventId);
      const db = getDb();
      const recent: ScanLogItem[] = db.scans
        .filter((s) => s.eventId === eventId && s.scannedBy === user.id)
        .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
        .slice(0, 5)
        .map((s) => {
          const ticket = s.ticketId ? db.tickets.find((t) => t.id === s.ticketId) : undefined;
          return {
            id: s.id,
            scannedAt: s.scannedAt,
            result: s.result,
            holderName: ticket?.holderName ?? null,
            ticketCode: ticket?.code ?? null,
            note: s.note,
          };
        });
      const checkedByMe = db.tickets.filter((t) => t.eventId === eventId && t.checkedInBy === user.id).length;
      const viewerRole = event.organizerId === user.id ? 'organizer' : 'volunteer';
      return { event: toSummary(event), viewerRole, checkedByMe, recent };
    },

    /** Порядок проверок — как в заметке «Билет и правила сканирования» в макете. */
    async scan(eventId, rawCode) {
      await delay(400);
      // 1. Сканирующий — организатор или волонтёр этого мероприятия.
      const { user } = requireScannerAccess(eventId);
      const db = getDb();
      const code = rawCode.trim();
      const now = new Date().toISOString();
      const log = (result: ScanResult['result'], ticketId: string | null, note: string) => {
        db.scans.push({ id: randomId('sc'), eventId, scannedBy: user.id, scannedAt: now, result, ticketId, note });
        saveDb();
      };

      // 2. Билет найден и относится к этому мероприятию.
      const ticket = db.tickets.find((t) => t.qrToken === code || t.code.toLowerCase() === code.toLowerCase());
      if (!ticket) {
        log('invalid', null, 'билет не найден');
        return { result: 'invalid', reason: 'Билет не найден' };
      }
      if (ticket.eventId !== eventId) {
        log('invalid', ticket.id, 'билет другого мероприятия');
        return { result: 'invalid', reason: 'Билет другого мероприятия', ticketCode: ticket.code, holderName: ticket.holderName };
      }
      // 3. Регистрация не отменена.
      if (ticket.status === 'cancelled') {
        log('invalid', ticket.id, 'регистрация отменена');
        return { result: 'invalid', reason: 'Регистрация отменена', ticketCode: ticket.code, holderName: ticket.holderName };
      }
      // 4. Билет ещё не использован.
      if (ticket.status === 'used') {
        const by = db.users.find((u) => u.id === ticket.checkedInBy)?.fullName;
        log('already_used', ticket.id, `уже проходил(а) в ${formatTime(ticket.checkedInAt!)}`);
        return {
          result: 'already_used',
          ticketCode: ticket.code,
          holderName: ticket.holderName,
          category: ticket.category,
          checkedInAt: ticket.checkedInAt!,
          checkedInBy: by,
        };
      }
      // 5. Всё в порядке → «Использован», фиксируем время чекина.
      ticket.status = 'used';
      ticket.checkedInAt = now;
      ticket.checkedInBy = user.id;
      log('allowed', ticket.id, '');
      return {
        result: 'allowed',
        ticketCode: ticket.code,
        holderName: ticket.holderName,
        category: ticket.category,
        checkedInAt: now,
      };
    },
  },
};
