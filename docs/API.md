# REST API

Контракт React и FastAPI. Типы фронтенда описаны в `src/api/types.ts`. OpenAPI доступен по `/api/docs`.

## Общее

- Базовый URL: `VITE_API_URL` (по умолчанию `/api`).
- Формат: JSON, даты — ISO 8601 (`2026-10-24T10:00:00+03:00`).
- Авторизация: заголовок `Authorization: Bearer <token>`. Токен приходит в ответе входа/регистрации.
- Ошибка — любой статус 4xx/5xx с телом:

```json
{ "code": "EMAIL_TAKEN", "message": "Человекочитаемый текст", "fields": { "email": "Почта уже зарегистрирована" } }
```

Коды: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION` (422, с `fields`), `EMAIL_TAKEN` (409), `INVALID_CREDENTIALS` (401), `ALREADY_REGISTERED` (409), `EVENT_FULL` (409). Если `code` нет, фронт выводит его из статуса.

## Аутентификация и профиль

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` | `Session` |
| POST | `/auth/register` | `{ fullName, email, password }` | `Session` |
| POST | `/auth/logout` | — | 204 |
| POST | `/auth/resend-verification` | `{ email }` | 204 |
| POST | `/auth/forgot-password` | `{ email }` | 204 |
| POST | `/auth/email-link` | `{ token, password? }` | 204 |
| GET | `/me` | — | `User` |
| PATCH | `/me` | частичный `User` (`fullName`, `email`, `phone`, `organization`, `notificationsEnabled`) | `User` |
| DELETE | `/me` | — | 204 |

`Session = { token, user: User }`

`User = { id, publicId, fullName, email, phone, organization, emailVerified, notificationsEnabled }`

`publicId` — короткий ID («Ваш ID» в профиле), по нему организатор выдаёт права волонтёра.

## Мероприятия

| Метод | Путь | Кто | Ответ |
| --- | --- | --- | --- |
| GET | `/events/{slug}` | все, токен необязателен | `{ event: EventDetails, viewer: { ticketId, isOrganizer, isVolunteer } }` |
| GET | `/events/by-id/{id}` | организатор | `EventDetails` |
| GET | `/me/events?tab=organizing\|volunteering\|drafts` | авторизованный | `{ items: EventSummary[], counters: { organizing, volunteering, drafts }, roles: ('organizer'\|'volunteer')[] }` |
| POST | `/events` | авторизованный | тело `EventInput & { publish: boolean }` → `EventDetails` |
| PATCH | `/events/{id}` | организатор | `EventInput` → `EventDetails` |
| POST | `/events/{id}/publish` | организатор | `EventDetails` |

`EventSummary = { id, slug, title, status, startsAt, location, checkpoint?, capacity, registeredCount, checkedInCount }`, где `status`: `draft | published | live | finished` (`live`/`finished` сервер вычисляет по времени).

`EventDetails = EventSummary & { description, category, priceType: 'free'|'paid', coverUrl, coverCaption?, coverBadge?, sections: {id,title,time}[], questions: Question[], organizerId }`

`Question = { id, label, type, required, placeholder?, help?, options?: { value, label, hint? }[] }`

Типы поля: `text`, `textarea`, `email`, `tel`, `number`, `date`, `choice`, `select`, `multiple`. Последние три требуют от двух вариантов. Порядок массива `questions` задаёт порядок полей. `multiple` принимает массив уникальных значений из вариантов, остальные поля принимают строку. Дата передаётся в формате `YYYY-MM-DD`.

`EventInput = { title, description, startsAt, location, capacity, priceType, questions }`

## Регистрация и билеты

| Метод | Путь | Тело / параметры | Ответ |
| --- | --- | --- | --- |
| POST | `/events/{eventId}/registrations` | `{ answers: { [questionId]: string | string[] }, guest?: { fullName, email, phone } }` | `{ ticket: Ticket, accountCreated: boolean, accessToken: string | null }` |
| GET | `/me/tickets?scope=upcoming\|past` | — | `{ items: Ticket[], counters: { upcoming, past } }` |
| GET | `/tickets/{id}?token=` | `token` — для гостя без аккаунта | `Ticket` |
| GET | `/tickets/{id}/pdf?token=` | те же права доступа, что для билета | PDF |
| POST | `/tickets/{id}/cancel` | — | `Ticket` |

Логика регистрации (из макета):
- авторизованный — `guest` не передаётся, имя/почта/телефон берутся из профиля; повторная регистрация → `409 ALREADY_REGISTERED`;
- гость с новой почтой — билет создаётся сразу, аккаунт создаётся автоматически (`accountCreated: true`), на почту уходит письмо с билетом и ссылкой «подтвердить почту и задать пароль»;
- гость с почтой существующего аккаунта — `409 EMAIL_TAKEN`, фронт отправляет на вход и после входа повторяет запрос с теми же ответами;
- нет мест — `409 EVENT_FULL`.

`Ticket = { id, code, qrToken, status: 'active'|'used'|'cancelled', holderName, holderEmail, category, zone, createdAt, checkedInAt, event: EventSummary & { category } }`

`qrToken` — случайный токен для сканера. Гостевой `accessToken` выдаётся отдельно и открывает билет и его PDF. Ссылки для подтверждения почты, первого пароля и его восстановления одноразовые и действуют 24 часа.

## Организатор

Создать мероприятие может любой авторизованный пользователь. Его роль организатора действует для созданного им мероприятия. Разделы статистики, участников, экспорта и волонтёров открываются после публикации и остаются доступны организатору после завершения. Выдача новых прав закрывается после завершения.

| Метод | Путь | Ответ |
| --- | --- | --- |
| GET | `/events/{id}/stats` | `{ registered, capacity, checkedIn, notCheckedIn }` |
| GET | `/events/{id}/attendees?search=&page=&pageSize=` | `{ items: Attendee[], total, page, pageSize }` |
| GET | `/events/{id}/attendees/export` | файл (CSV или XLSX) |
| GET | `/events/{id}/volunteers` | `Volunteer[]` |
| POST | `/events/{id}/volunteers` | тело `{ identifier }` (email или publicId) → `Volunteer` |
| DELETE | `/events/{id}/volunteers/{userId}` | 204 |

`Attendee = { ticketId, ticketCode, fullName, email, status: 'present'|'expected'|'cancelled', checkedInAt, answers }`

`Volunteer = { userId, publicId, fullName, email, grantedAt }`

## Сканер

Для опубликованного или идущего мероприятия доступ есть у организатора и назначенных им волонтёров. Роль волонтёра действует только на этом мероприятии. Отзыв прав применяется к следующему запросу, а открытый сканер проверяет доступ каждые 10 секунд.

| Метод | Путь | Кто | Ответ |
| --- | --- | --- | --- |
| GET | `/events/{id}/scanner` | организатор или волонтёр, иначе 403 | `{ event: EventSummary, viewerRole: 'organizer'\|'volunteer', checkedByMe, recent: ScanLogItem[] }` |
| POST | `/events/{id}/scan` | то же | тело `{ code }` → `ScanResult` |

`code` — содержимое QR (`qrToken`) или номер билета, введённый вручную (`EVT-849102`).

Проверки при сканировании, по порядку (заметка «Билет и правила сканирования»):
1. сканирующий — организатор или волонтёр этого мероприятия, иначе 403;
2. билет найден и относится к этому мероприятию, иначе `invalid`;
3. регистрация не отменена, иначе `invalid`;
4. билет ещё не использован, иначе `already_used` (с временем первого прохода);
5. всё в порядке → статус «Использован», фиксируется время чекина → `allowed`.

`ScanResult = { result: 'allowed'|'already_used'|'invalid', reason?, ticketCode?, holderName?, category?, checkedInAt?, checkedInBy? }`

`ScanLogItem = { id, scannedAt, result, holderName, ticketCode, note }`

## EventPass 1.1

Машиночитаемая схема доступна по `/api/openapi.json`.

- `POST /events` сохраняет неполный черновик. `PATCH /events/{id}` меняет только переданные поля. Публикация проверяет готовность данных. `endsAt: null` задаёт окончание через четыре часа после начала. Владелец может завершить событие через `POST /events/{id}/finish`.
- `POST /assets/event-covers` принимает multipart с полем `file`. Передайте полученный `assetId` как `coverAssetId`. Значение `null` снимает обложку. Адрес обложки возвращается относительно хоста API. Непривязанные файлы удаляются после 24 часов. `sections` сохраняются в порядке отправки.
- Для анкеты `checkbox` передаёт JSON boolean. Обязательный флажок требует `true`. Неизвестные вопросы возвращаются в `fields` по ID.
- Владелец может отменить билет через `POST /events/{id}/attendees/{ticketId}/cancel`. Повтор отмены успешен. Чекин и отмена синхронизированы. XLSX доступен через `GET /events/{id}/attendees/export?format=xlsx`.
- `stats` и `attendees` возвращают `revision`. Передавайте значение из первой страницы для следующих страниц. При `STALE_PAGE` (409) перечитайте первую страницу и статистику.
- Signup и регистрация требуют `consentAccepted: true`. URL и версии документов доступны в `GET /auth/consent`. Сервер фиксирует время согласия и настроенные версии.
- Для создания события, регистрации и сканирования отправляйте случайный `Idempotency-Key` длиной 16–128 символов. Сохраните ключ и тело до получения ответа. Успешный результат повторяется в течение 24 часов при наличии доступа. Если тело изменилось, сервер возвращает `IDEMPOTENCY_CONFLICT` (409). Ответ повтора scan содержит исходный `scanId` и `replayed: true`. Новый scan использованного билета возвращает `already_used`. Отклонённые HTTP-команды можно повторить после устранения причины.
- При `RATE_LIMITED` (429) выждите указанное в заголовке `Retry-After` количество секунд.
