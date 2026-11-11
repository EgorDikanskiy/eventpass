import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { EventDetails, EventInput, RegisterForEventResponse, Session, User } from '../src/api/types';

const password = 'Test-password-2026';

function eventInput(capacity = 1, startsInHours = 48): EventInput {
  return {
    title: 'Проверка API',
    description: 'Интеграционный тест',
    startsAt: new Date(Date.now() + startsInHours * 3_600_000).toISOString(),
    location: 'Аудитория 10',
    capacity,
    priceType: 'free',
    questions: [
      { id: 'format', label: 'Формат', type: 'choice', required: true, options: [
        { value: 'onsite', label: 'Очно' }, { value: 'remote', label: 'Онлайн' },
      ] },
    ],
  };
}

async function registerUser(request: APIRequestContext, fullName: string): Promise<Session> {
  const response = await request.post('/api/auth/register', {
    data: { fullName, password, email: `${randomUUID()}@example.com` },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function createEvent(request: APIRequestContext, token: string, input: EventInput): Promise<EventDetails> {
  const response = await request.post('/api/events', {
    headers: authorization(token), data: { ...input, publish: true },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('capacity, registrations, ticket isolation and concurrent check-in', async ({ request }) => {
  const [organizer, first, second, volunteer] = await Promise.all([
    registerUser(request, 'Организатор'), registerUser(request, 'Первый участник'),
    registerUser(request, 'Второй участник'), registerUser(request, 'Волонтёр'),
  ]);
  const event = await createEvent(request, organizer.token, eventInput());
  const headers = authorization(organizer.token);
  const path = `/api/events/${event.id}`;
  const answers = { format: 'onsite' };

  const invalid = await request.post(`${path}/registrations`, {
    headers: authorization(first.token), data: { answers: { format: 'unknown' } },
  });
  expect(invalid.status()).toBe(422);
  expect(await invalid.json()).toMatchObject({ code: 'VALIDATION', fields: { format: expect.any(String) } });

  const registrations = await Promise.all([first, second].map((user) =>
    request.post(`${path}/registrations`, { headers: authorization(user.token), data: { answers } }),
  ));
  expect(registrations.map((response) => response.status()).sort()).toEqual([201, 409]);
  const winnerIndex = registrations.findIndex((response) => response.ok());
  const { ticket }: RegisterForEventResponse = await registrations[winnerIndex].json();
  const winner = [first, second][winnerIndex];
  const loser = [second, first][winnerIndex];
  expect(await registrations[1 - winnerIndex].json()).toMatchObject({ code: 'EVENT_FULL' });
  expect(await (await request.post(`${path}/registrations`, {
    headers: authorization(winner.token), data: { answers },
  })).json()).toMatchObject({ code: 'ALREADY_REGISTERED' });

  expect((await request.get(`/api/tickets/${ticket.id}`, { headers: authorization(loser.token) })).status()).toBe(403);
  expect((await request.get(`/api/tickets/${ticket.id}`, { params: { token: ticket.qrToken } })).status()).toBe(403);
  expect((await request.get(`${path}/scanner`, { headers: authorization(loser.token) })).status()).toBe(403);
  expect((await request.post(`${path}/volunteers`, {
    headers, data: { identifier: volunteer.user.email },
  })).status()).toBe(201);
  const volunteerHeaders = authorization(volunteer.token);
  const volunteerEvents = await request.get('/api/me/events?tab=volunteering', { headers: volunteerHeaders });
  expect(await volunteerEvents.json()).toMatchObject({ roles: ['volunteer'], items: [{ id: event.id }] });
  for (const route of ['attendees', 'attendees/export', 'stats', 'volunteers']) {
    expect((await request.get(`${path}/${route}`, { headers: volunteerHeaders })).status()).toBe(403);
  }
  expect((await request.patch(path, { headers: volunteerHeaders, data: eventInput() })).status()).toBe(403);

  const other = await createEvent(request, organizer.token, eventInput(2));
  const wrongEvent = await request.post(`/api/events/${other.id}/scan`, { headers, data: { code: ticket.code } });
  expect(await wrongEvent.json()).toEqual({ result: 'invalid', reason: 'Билет другого мероприятия' });
  const checks = await Promise.all([
    request.post(`${path}/scan`, { headers, data: { code: ticket.qrToken } }),
    request.post(`${path}/scan`, { headers: authorization(volunteer.token), data: { code: ticket.code.toLowerCase() } }),
  ]);
  const outcomes = await Promise.all(checks.map((response) => response.json()));
  expect(outcomes.map(({ result }) => result).sort()).toEqual(['allowed', 'already_used']);
  expect(outcomes[0].checkedInAt).toBe(outcomes[1].checkedInAt);
  expect(await (await request.get(`${path}/stats`, { headers })).json()).toEqual({
    registered: 1, capacity: 1, checkedIn: 1, notCheckedIn: 0,
  });
  expect((await request.post(`/api/tickets/${ticket.id}/cancel`, { headers: authorization(winner.token) })).status()).toBe(422);

  expect((await request.delete(`${path}/volunteers/${volunteer.user.id}`, { headers })).status()).toBe(204);
  expect((await request.post(`${path}/scan`, { headers: authorization(volunteer.token), data: { code: ticket.code } })).status()).toBe(403);

  const past = await createEvent(request, organizer.token, eventInput(1, -6));
  expect((await request.get(`/api/events/${past.id}/scanner`, { headers })).status()).toBe(403);
  expect((await request.get(`/api/events/${past.id}/stats`, { headers })).status()).toBe(200);
  const registration = await request.post(`/api/events/${past.id}/registrations`, {
    headers: authorization(first.token), data: { answers },
  });
  expect(registration.status()).toBe(422);

  const pagination = await request.get(`${path}/attendees`, { headers, params: { page: 2, pageSize: 1 } });
  expect(await pagination.json()).toEqual({ items: [], total: 1, page: 2, pageSize: 1 });

  for (const session of [organizer, first, second, volunteer]) {
    expect((await request.delete('/api/me', { headers: authorization(session.token) })).status()).toBe(204);
  }
});

test('sessions, duplicate email, profile and draft permissions', async ({ request }) => {
  const organizer = await registerUser(request, 'Организатор');
  const other = await registerUser(request, 'Другой аккаунт');
  const headers = authorization(organizer.token);
  const response = await request.post('/api/events', { headers, data: { ...eventInput(), publish: false } });
  expect(response.status()).toBe(201);
  const draft: EventDetails = await response.json();
  expect((await request.get(`/api/events/${draft.slug}`)).status()).toBe(404);
  expect((await request.get(`/api/events/${draft.id}/stats`, { headers })).status()).toBe(403);
  expect((await request.get(`/api/events/${draft.id}/scanner`, { headers })).status()).toBe(403);
  expect((await request.get(`/api/events/by-id/${draft.id}`, { headers: authorization(other.token) })).status()).toBe(403);
  expect((await request.post(`/api/events/${draft.id}/publish`, { headers })).status()).toBe(200);
  expect((await request.get(`/api/events/${draft.slug}`)).status()).toBe(200);

  const duplicate = await request.post('/api/auth/register', {
    data: { fullName: organizer.user.fullName, email: organizer.user.email.toUpperCase(), password },
  });
  expect(duplicate.status()).toBe(409);
  const update = await request.patch('/api/me', {
    headers, data: { fullName: 'Новое имя', phone: null, organization: 'Организация', notificationsEnabled: false },
  });
  const profile: User = await update.json();
  expect(profile).toMatchObject({ fullName: 'Новое имя', organization: 'Организация', notificationsEnabled: false });
  expect(profile).not.toHaveProperty('password_hash');
  expect((await request.post('/api/auth/logout', { headers })).status()).toBe(204);
  expect((await request.get('/api/me', { headers })).status()).toBe(401);
  const login = await request.post('/api/auth/login', { data: { email: organizer.user.email, password } });
  expect(login.status()).toBe(200);
  const session: Session = await login.json();
  expect(session.token).not.toBe(organizer.token);
  expect((await request.delete('/api/me', { headers: authorization(session.token) })).status()).toBe(204);
  expect((await request.get(`/api/events/${draft.slug}`)).status()).toBe(404);
  expect((await request.delete('/api/me', { headers: authorization(other.token) })).status()).toBe(204);
});

async function getMailSubjects(request: APIRequestContext, email: string): Promise<string[]> {
  const mailUrl = process.env.EVENTPASS_MAIL_URL ?? 'http://localhost:8025';
  const response = await request.get(`${mailUrl}/api/v1/search`, { params: { query: `to:${email}` } });
  expect(response.ok()).toBeTruthy();
  const { messages }: { messages: { Subject: string }[] } = await response.json();
  return messages.map((message) => message.Subject);
}

test('ticket receipt, event change and scheduled reminder respect email preferences', async ({ request }) => {
  const [organizer, attendee, optedOut] = await Promise.all([
    registerUser(request, 'Организатор'), registerUser(request, 'Участник'), registerUser(request, 'Без уведомлений'),
  ]);
  const muted = await request.patch('/api/me', {
    headers: authorization(optedOut.token), data: { notificationsEnabled: false },
  });
  expect(muted.ok()).toBeTruthy();

  const input = eventInput(2, 24 + 8 / 3600);
  const event = await createEvent(request, organizer.token, input);
  for (const session of [attendee, optedOut]) {
    const response = await request.post(`/api/events/${event.id}/registrations`, {
      headers: authorization(session.token), data: { answers: { format: 'onsite' } },
    });
    expect(response.status()).toBe(201);
  }
  const updated = await request.patch(`/api/events/${event.id}`, {
    headers: authorization(organizer.token), data: { ...input, location: 'Новая аудитория' },
  });
  expect(updated.ok()).toBeTruthy();

  const subjects = ['Ваш билет EventPass', 'Организатор обновил мероприятие', 'Напоминание о мероприятии EventPass'];
  await expect.poll(() => getMailSubjects(request, attendee.user.email), { timeout: 20_000 })
    .toEqual(expect.arrayContaining(subjects));
  expect(await getMailSubjects(request, optedOut.user.email)).toEqual(['Подтвердите почту в EventPass']);

  for (const session of [organizer, attendee, optedOut]) {
    expect((await request.delete('/api/me', { headers: authorization(session.token) })).status()).toBe(204);
  }
});

test('custom question types validate on the server and preserve historical answers', async ({ request }) => {
  const organizer = await registerUser(request, 'Организатор анкеты');
  const attendee = await registerUser(request, 'Участник с анкетой');
  const headers = authorization(organizer.token);
  const input: EventInput = {
    ...eventInput(),
    questions: [
      { id: 'email', label: 'Рабочая почта', type: 'email', required: true, help: 'Укажите рабочий адрес' },
      { id: 'phone', label: 'Рабочий телефон', type: 'tel', required: true },
      { id: 'number', label: 'Количество', type: 'number', required: true },
      { id: 'date', label: 'День приезда', type: 'date', required: true },
      { id: 'description', label: 'О себе', type: 'textarea', required: true },
      { id: 'format', label: 'Формат', type: 'select', required: true, options: [
        { value: 'onsite', label: 'Очно' }, { value: 'remote', label: 'Онлайн' },
      ] },
      { id: 'topics', label: 'Темы', type: 'multiple', required: true, options: [
        { value: 'frontend', label: 'Фронтенд' }, { value: 'backend', label: 'Бэкенд' },
      ] },
    ],
  };
  const event = await createEvent(request, organizer.token, input);
  expect(event.questions[0]).toMatchObject({ help: 'Укажите рабочий адрес' });
  const path = `/api/events/${event.id}`;
  const attendeeHeaders = authorization(attendee.token);
  const invalid = await request.post(`${path}/registrations`, {
    headers: attendeeHeaders,
    data: { answers: {
      email: 'invalid', phone: '123', number: 'Infinity', date: '2026-02-30', description: ['text'],
      format: 'missing', topics: ['backend', 'backend'],
    } },
  });
  expect(invalid.status()).toBe(422);
  const { fields } = await invalid.json();
  expect(Object.keys(fields).sort()).toEqual(input.questions.map((question) => question.id).sort());
  const valid = await request.post(`${path}/registrations`, {
    headers: attendeeHeaders,
    data: { answers: {
      email: 'worker@example.com', phone: '+7 (999) 123-45-67', number: '3.5', date: '2026-12-01',
      description: 'Две\nстроки', format: 'onsite', topics: ['frontend', 'backend'],
    } },
  });
  expect(valid.status(), await valid.text()).toBe(201);
  const attendees = await request.get(`${path}/attendees`, { headers });
  expect(await attendees.json()).toMatchObject({ items: [{ answers: { topics: ['frontend', 'backend'] } }] });
  const edited = await request.patch(path, {
    headers, data: { ...input, questions: input.questions.filter((question) => question.id !== 'topics') },
  });
  expect(edited.ok()).toBeTruthy();
  const exported = await request.get(`${path}/attendees/export`, { headers });
  const csv = await exported.text();
  expect(csv).toContain('Темы');
  expect(csv).toContain('Фронтенд, Бэкенд');
  for (const session of [organizer, attendee]) {
    expect((await request.delete('/api/me', { headers: authorization(session.token) })).status()).toBe(204);
  }
});
