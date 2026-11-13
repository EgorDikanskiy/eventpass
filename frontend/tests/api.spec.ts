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
    data: { consentAccepted: true, fullName, password, email: `${randomUUID()}@example.com` },
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
    headers: authorization(first.token), data: { consentAccepted: true, answers: { format: 'unknown' } },
  });
  expect(invalid.status()).toBe(422);
  expect(await invalid.json()).toMatchObject({ code: 'VALIDATION', fields: { format: expect.any(String) } });

  const registrations = await Promise.all([first, second].map((user) =>
    request.post(`${path}/registrations`, { headers: authorization(user.token), data: { consentAccepted: true, answers } }),
  ));
  expect(registrations.map((response) => response.status()).sort()).toEqual([201, 409]);
  const winnerIndex = registrations.findIndex((response) => response.ok());
  const { ticket }: RegisterForEventResponse = await registrations[winnerIndex].json();
  const winner = [first, second][winnerIndex];
  const loser = [second, first][winnerIndex];
  expect(await registrations[1 - winnerIndex].json()).toMatchObject({ code: 'EVENT_FULL' });
  expect(await (await request.post(`${path}/registrations`, {
    headers: authorization(winner.token), data: { consentAccepted: true, answers },
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
    registered: 1, capacity: 1, checkedIn: 1, notCheckedIn: 0, revision: expect.any(String),
  });
  expect((await request.post(`/api/tickets/${ticket.id}/cancel`, { headers: authorization(winner.token) })).status()).toBe(409);

  expect((await request.delete(`${path}/volunteers/${volunteer.user.id}`, { headers })).status()).toBe(204);
  expect((await request.post(`${path}/scan`, { headers: authorization(volunteer.token), data: { code: ticket.code } })).status()).toBe(403);

  const past = await createEvent(request, organizer.token, eventInput(1, -6));
  expect((await request.get(`/api/events/${past.id}/scanner`, { headers })).status()).toBe(403);
  expect((await request.get(`/api/events/${past.id}/stats`, { headers })).status()).toBe(200);
  const registration = await request.post(`/api/events/${past.id}/registrations`, {
    headers: authorization(first.token), data: { consentAccepted: true, answers },
  });
  expect(registration.status()).toBe(409);

  const pagination = await request.get(`${path}/attendees`, { headers, params: { page: 2, pageSize: 1 } });
  expect(await pagination.json()).toEqual({ items: [], total: 1, page: 2, pageSize: 1, revision: expect.any(String) });

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
    data: { consentAccepted: true, fullName: organizer.user.fullName, email: organizer.user.email.toUpperCase(), password },
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
      headers: authorization(session.token), data: { consentAccepted: true, answers: { format: 'onsite' } },
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
    data: { consentAccepted: true, answers: {
      email: 'invalid', phone: '123', number: 'Infinity', date: '2026-02-30', description: ['text'],
      format: 'missing', topics: ['backend', 'backend'],
    } },
  });
  expect(invalid.status()).toBe(422);
  const { fields } = await invalid.json();
  expect(Object.keys(fields).sort()).toEqual(input.questions.map((question) => question.id).sort());
  const valid = await request.post(`${path}/registrations`, {
    headers: attendeeHeaders,
    data: { consentAccepted: true, answers: {
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

test('draft, cover, program, cancellation, replay, export and event finish', async ({ request }) => {
  const owner = await registerUser(request, 'Организатор');
  const guest = await registerUser(request, '=1+1');
  const headers = authorization(owner.token);
  const guestHeaders = authorization(guest.token);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=', 'base64');
  const assetPath = '/api/assets/event-covers';
  const invalidImage = await request.post(assetPath, {
    headers, multipart: { file: { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') } },
  });
  expect(await invalidImage.json()).toMatchObject({ code: 'INVALID_IMAGE' });
  const upload = await request.post(assetPath, {
    headers, multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: png } },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const asset = await upload.json();
  expect(asset).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 });
  expect((await request.get(asset.url)).status()).toBe(404);
  expect((await request.post('/api/events', { headers: guestHeaders, data: { coverAssetId: asset.assetId } })).status()).toBe(403);

  const key = randomUUID();
  const createHeaders = { ...headers, 'Idempotency-Key': key };
  const draftData = { coverAssetId: asset.assetId, questions: [{ id: 'confirm', type: 'checkbox' }] };
  const drafts = await Promise.all([1, 2].map(() => request.post('/api/events', { headers: createHeaders, data: draftData })));
  expect(drafts.map((response) => response.status())).toEqual([201, 201]);
  const draft = await drafts[0].json();
  expect(await drafts[1].json()).toEqual(draft);
  expect(draft).toMatchObject({ status: 'draft', startsAt: null, capacity: null });
  const path = '/api/events/' + draft.id;
  expect((await request.post(path + '/publish', { headers })).status()).toBe(422);
  const input = eventInput(3, 1);
  const endsAt = new Date(Date.now() + 2 * 3600_000).toISOString();
  const form = {
    ...input, endsAt, sections: [{ id: 'one', title: 'Открытие', time: '10:00' }],
    questions: [{ id: 'confirm', label: '=1+1', type: 'checkbox', required: true }],
  };
  expect((await request.patch(path, { headers, data: form })).status()).toBe(200);
  const published = await request.post(path + '/publish', { headers });
  expect(published.status(), await published.text()).toBe(200);
  const event = await published.json();
  expect(event).toMatchObject({ slug: draft.slug, sections: form.sections, coverUrl: asset.url });
  expect(Date.parse(event.effectiveEndsAt)).toBe(Date.parse(endsAt));
  expect((await request.get(asset.url)).headers()['content-type']).toBe('image/png');

  const registrations = path + '/registrations';
  for (const data of [
    { consentAccepted: false, answers: { confirm: true } },
    { consentAccepted: true, answers: { confirm: false } },
    { consentAccepted: true, answers: { confirm: true, removed: 'old' } },
  ]) {
    expect((await request.post(registrations, { headers: guestHeaders, data })).status()).toBe(422);
  }
  const data = { consentAccepted: true, answers: { confirm: true } };
  const registerHeaders = { ...guestHeaders, 'Idempotency-Key': randomUUID() };
  const registration = await request.post(registrations, { headers: registerHeaders, data });
  expect(registration.status(), await registration.text()).toBe(201);
  const { ticket } = await registration.json();
  expect(await (await request.post(registrations, { headers: registerHeaders, data })).json()).toEqual(await registration.json());
  const stats = await (await request.get(path + '/stats', { headers })).json();
  const cancel = path + '/attendees/' + ticket.id + '/cancel';
  expect((await request.post(cancel, { headers: guestHeaders })).status()).toBe(403);
  expect((await request.post(cancel, { headers })).status()).toBe(200);
  expect((await request.post(cancel, { headers })).status()).toBe(200);
  const stale = await request.get(path + '/attendees', { headers, params: { revision: stats.revision, page: 2 } });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ code: 'STALE_PAGE' });

  const next = await request.post(registrations, { headers: guestHeaders, data });
  expect(next.status()).toBe(201);
  const nextTicket = (await next.json()).ticket;
  expect(nextTicket.id).not.toBe(ticket.id);
  expect((await request.post(path + '/volunteers', { headers, data: { identifier: guest.user.publicId } })).status()).toBe(201);
  const scanHeaders = { ...guestHeaders, 'Idempotency-Key': randomUUID() };
  const scan = { code: nextTicket.code };
  const first = await request.post(path + '/scan', { headers: scanHeaders, data: scan });
  expect(await first.json()).toMatchObject({ result: 'allowed' });
  expect(await (await request.post(path + '/scan', { headers: scanHeaders, data: scan })).json())
    .toMatchObject({ result: 'allowed', replayed: true });
  expect(await (await request.post(path + '/scan', { headers: guestHeaders, data: scan })).json())
    .toMatchObject({ result: 'already_used' });
  expect(await (await request.get(path + '/volunteers', { headers })).json())
    .toMatchObject([{ checkedInCount: 1 }]);

  expect((await request.patch(path, { headers, data: { questions: [{ id: 'confirm', label: 'Новое поле', type: 'text' }] } })).status()).toBe(200);
  const xlsx = await request.get(path + '/attendees/export?format=xlsx', { headers });
  expect(xlsx.headers()['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  expect((await xlsx.body()).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const csv = await (await request.get(path + '/attendees/export', { headers })).text();
  expect(csv).toContain("'=1+1");
  expect(csv).toContain('Отменён');

  expect((await request.post(path + '/finish', { headers: guestHeaders })).status()).toBe(403);
  const finished = await (await request.post(path + '/finish', { headers })).json();
  expect(finished).toMatchObject({ status: 'finished', finishedAt: expect.any(String) });
  expect(await (await request.post(path + '/finish', { headers })).json()).toEqual(finished);
  const moved = await request.patch(path, { headers, data: { startsAt: null, endsAt: null } });
  expect(moved.status()).toBe(422);
  const rescheduled = await request.patch(path, { headers, data: { startsAt: input.startsAt, endsAt: null } });
  expect(await rescheduled.json()).toMatchObject({ status: 'finished', finishedAt: finished.finishedAt });
  expect(await (await request.post(registrations, { headers: guestHeaders, data })).json()).toMatchObject({ code: 'EVENT_FINISHED' });
});

test('scan and organizer cancellation serialize on the same ticket', async ({ request }) => {
  const organizer = await registerUser(request, 'Организатор');
  const attendee = await registerUser(request, 'Участник');
  const event = await createEvent(request, organizer.token, eventInput(2, 1));
  const path = '/api/events/' + event.id;
  const headers = authorization(organizer.token);
  const registration = await request.post(path + '/registrations', {
    headers: authorization(attendee.token), data: { consentAccepted: true, answers: { format: 'onsite' } },
  });
  const { ticket } = await registration.json();
  const [scan, cancel] = await Promise.all([
    request.post(path + '/scan', { headers, data: { code: ticket.code } }),
    request.post(path + '/attendees/' + ticket.id + '/cancel', { headers }),
  ]);
  const result = await scan.json();
  if (result.result === 'allowed') {
    expect(cancel.status()).toBe(409);
    expect(await cancel.json()).toMatchObject({ code: 'TICKET_USED' });
  } else {
    expect(result.result).toBe('invalid');
    expect(cancel.status()).toBe(200);
  }
});

test('auth limits count failed attempts and return retry time', async ({ request }) => {
  const email = randomUUID() + '@example.com';
  const data = { email, password: 'wrong password' };
  for (let attempt = 0; attempt < 15; attempt++) {
    expect((await request.post('/api/auth/login', { data })).status()).toBe(401);
  }
  const limited = await request.post('/api/auth/login', { data });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  expect(await limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
});
