import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { EventDetails, RegisterForEventResponse } from '../src/api/types';

interface Account {
  name: string;
  email: string;
  password: string;
}

interface MailMessage {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

function account(name: string): Account {
  return { name, email: `${randomUUID()}@example.com`, password: 'Eventpass-test-2026' };
}

async function signUp(page: Page, user: Account): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Имя и фамилия').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel(/^Пароль/).fill(user.password);
  await page.getByRole('checkbox', { name: /Я согласен/ }).check();
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page.getByRole('heading', { name: 'Мои билеты' })).toBeVisible();
}

async function logIn(page: Page, user: Account, pending = false): Promise<void> {
  if (!pending) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
  }
  await page.getByLabel(/^Пароль/).fill(user.password);
  await page.getByRole('button', { name: pending ? 'Войти и завершить регистрацию' : 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои билеты' })).toBeVisible();
}

async function getMailLink(request: APIRequestContext, email: string, subject: string, action: string): Promise<string> {
  const mailUrl = process.env.EVENTPASS_MAIL_URL ?? 'http://localhost:8025';
  let message: MailMessage | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${mailUrl}/api/v1/search`, { params: { query: `to:${email}` } });
    const { messages }: { messages: MailMessage[] } = await response.json();
    message = messages.find((item) => item.Subject === subject && item.To.some((recipient) => recipient.Address === email));
    return message?.ID;
  }).toBeTruthy();
  const response = await request.get(`${mailUrl}/api/v1/message/${message!.ID}`);
  const { Text }: { Text: string } = await response.json();
  const link = Text.match(/https?:\/\/[^\s]+\/account-link#[^\s]+/)?.[0];
  expect(link).toContain(`action=${action}`);
  return link!;
}

async function fillGuest(page: Page, user: Account): Promise<void> {
  await page.getByLabel('Имя и фамилия').fill(user.name);
  await page.getByLabel(/^Email/).fill(user.email);
  await page.getByLabel('Телефон').fill('+7 999 123-45-67');
  await page.getByRole('checkbox', { name: /Я согласен/ }).check();
}

async function checkManual(page: Page, code: string, result: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Код билета' }).fill(code);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByRole('heading', { name: result })).toBeVisible();
}

test('organizer, guest, attendee and volunteer through the running web app', async ({ browser, request }) => {
  const organizer = account('Организатор Проверка');
  const volunteer = account('Волонтёр Проверка');
  const guest = account('Гость Проверка');
  const volunteerPage = await browser.newPage();
  const organizerPage = await browser.newPage();
  const guestPage = await browser.newPage();
  const existingGuest = await browser.newPage();
  const unexpectedErrors: string[] = [];
  for (const page of [volunteerPage, organizerPage, guestPage, existingGuest]) {
    page.on('pageerror', (error) => unexpectedErrors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        unexpectedErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
  }
  const eventTitle = `Встреча ${randomUUID().slice(0, 8)}`;
  let event: EventDetails;
  let guestRegistration: RegisterForEventResponse;
  let attendeeTicket: RegisterForEventResponse['ticket'];

  await test.step('sign up, verify email and update profile', async () => {
    await signUp(organizerPage, organizer);
    const verification = await getMailLink(request, organizer.email, 'Подтвердите почту в EventPass', 'verify');
    await organizerPage.goto(verification);
    await organizerPage.getByRole('button', { name: 'Подтвердить почту' }).click();
    await expect(organizerPage.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
    await expect(organizerPage.getByText('Почта не подтверждена')).toHaveCount(0);
    await organizerPage.getByLabel('Вуз / Компания').fill('Тестовый университет');
    await organizerPage.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(organizerPage.getByText('Изменения сохранены')).toBeVisible();
    await signUp(volunteerPage, volunteer);
  });

  await test.step('create and publish a draft with a custom question', async () => {
    await organizerPage.goto('/events/new');
    await organizerPage.getByLabel('Название мероприятия').fill(eventTitle);
    await organizerPage.getByLabel('Описание').fill('Открытое мероприятие EventPass');
    await organizerPage.getByLabel('Дата начала').fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
    await organizerPage.getByLabel('Время', { exact: true }).fill('12:30');
    await organizerPage.getByLabel('Место / аудитория').fill('Тестовый зал');
    await organizerPage.getByLabel('Лимит участников').fill('3');
    await organizerPage.getByRole('button', { name: 'Добавить вопрос' }).click();
    await organizerPage.getByRole('textbox', { name: 'Текст вопроса' }).last().fill('Ваш город');
    await organizerPage.getByRole('button', { name: 'Добавить вопрос' }).click();
    await organizerPage.getByRole('textbox', { name: 'Текст вопроса' }).last().fill('Интересующие секции');
    await organizerPage.getByRole('combobox', { name: 'Тип ответа' }).last().selectOption('multiple');
    await organizerPage.getByRole('textbox', { name: 'Вариант 1', exact: true }).fill('Практика');
    await organizerPage.getByRole('textbox', { name: 'Вариант 2', exact: true }).fill('Лекции');
    await organizerPage.getByRole('textbox', { name: 'Пояснение к варианту 1' }).fill('Разбор задач');
    await organizerPage.getByRole('textbox', { name: 'Подсказка к вопросу' }).last().fill('Можно отметить несколько');
    await organizerPage.getByRole('button', { name: 'Поднять вопрос 3' }).click();

    for (const width of [1280, 960, 390, 320]) {
      await organizerPage.setViewportSize({ width, height: 800 });
      const layout = await organizerPage.getByRole('textbox', { name: 'Вариант 1', exact: true }).evaluate((input) => {
        const row = input.parentElement!.parentElement!;
        const bounds = row.getBoundingClientRect();
        return {
          fitsRow: Array.from(row.children).every((item) => item.getBoundingClientRect().right <= bounds.right + 1),
          fitsPage: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      expect(layout, `viewport ${width}`).toEqual({ fitsRow: true, fitsPage: true });
    }

    await organizerPage.getByRole('button', { name: 'Предпросмотр' }).click();
    const preview = organizerPage.getByRole('dialog');
    await expect(preview.getByLabel('Имя и фамилия')).toBeVisible();
    await expect(preview.getByText('Можно отметить несколько')).toBeVisible();
    await preview.getByRole('checkbox', { name: /Практика/ }).check();
    await preview.getByRole('checkbox', { name: 'Лекции' }).check();
    await expect(preview.getByRole('button', { name: 'Получить QR-билет' })).toBeDisabled();
    await preview.getByRole('tab', { name: 'Участник' }).click();
    await expect(preview.getByLabel('Имя и фамилия')).toHaveCount(0);
    await expect(preview.getByText(organizer.name, { exact: false })).toBeVisible();
    await organizerPage.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await organizerPage.setViewportSize({ width: 1280, height: 800 });
    const created = organizerPage.waitForResponse((response) => response.url().endsWith('/api/events') && response.request().method() === 'POST');
    await organizerPage.getByRole('button', { name: 'Сохранить черновик' }).click();
    event = await (await created).json();
    await expect(organizerPage).toHaveURL(/tab=drafts/);
    await organizerPage.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await expect(organizerPage.getByText('Мероприятие опубликовано', { exact: true })).toBeVisible();
  });

  await test.step('guest signs up, downloads a PDF and claims the account from email', async () => {
    await guestPage.goto(`/e/${event.slug}`);
    await fillGuest(guestPage, guest);
    await guestPage.getByLabel('Ваш город').fill('Москва');
    await guestPage.getByRole('checkbox', { name: /Практика/ }).check();
    await guestPage.getByRole('checkbox', { name: 'Лекции' }).check();
    const registration = guestPage.waitForResponse((response) => response.url().endsWith('/registrations') && response.status() === 201);
    await guestPage.getByRole('button', { name: 'Получить QR-билет' }).click();
    guestRegistration = await (await registration).json();
    await expect(guestPage.getByText('Вы зарегистрированы')).toBeVisible();
    expect(guestRegistration.accessToken).not.toBe(guestRegistration.ticket.qrToken);
    await guestPage.getByRole('button', { name: 'Развернуть QR-код на весь экран' }).click();
    await expect(guestPage.getByRole('dialog')).toBeVisible();
    await guestPage.keyboard.press('Escape');
    const downloadPromise = guestPage.waitForEvent('download');
    await guestPage.getByRole('button', { name: 'Скачать PDF' }).click();
    const download = await downloadPromise;
    const pdf = await readFile((await download.path())!);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(download.suggestedFilename()).toBe(`${guestRegistration.ticket.code}.pdf`);

    await guestPage.getByRole('button', { name: /Письмо не пришло/ }).click();
    const setupLink = await getMailLink(request, guest.email, 'Ваш билет EventPass', 'setup');
    await guestPage.goto(setupLink);
    await guestPage.getByLabel('Новый пароль').fill(guest.password);
    await guestPage.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(guestPage.getByRole('heading', { name: 'Вход в EventPass' })).toBeVisible();
    await logIn(guestPage, guest);
    await expect(guestPage.getByRole('link', { name: eventTitle })).toBeVisible();
    await guestPage.getByRole('button', { name: 'Отменить регистрацию', exact: true }).click();
    await guestPage.getByRole('dialog').getByRole('button', { name: 'Отменить регистрацию' }).click();
    await guestPage.getByRole('tab', { name: /Прошедшие/ }).click();
    await expect(guestPage.getByText('Отменён', { exact: true })).toBeVisible();
  });

  await test.step('existing account resumes registration after signing in', async () => {
    await existingGuest.goto(`/e/${event.slug}`);
    await fillGuest(existingGuest, volunteer);
    await existingGuest.getByLabel('Ваш город').fill('Казань');
    await existingGuest.getByRole('button', { name: 'Получить QR-билет' }).click();
    await expect(existingGuest.getByText('У вас уже есть аккаунт')).toBeVisible();
    const registered = existingGuest.waitForResponse((response) => response.url().endsWith('/registrations') && response.status() === 201);
    await logIn(existingGuest, volunteer, true);
    const result: RegisterForEventResponse = await (await registered).json();
    attendeeTicket = result.ticket;
    await expect(existingGuest.getByRole('link', { name: eventTitle })).toBeVisible();
  });

  await test.step('grant access and scan a QR through the camera, then check by number', async () => {
    await organizerPage.goto(`/events/${event.id}/volunteers`);
    await volunteerPage.goto('/profile');
    const publicId = await volunteerPage.getByRole('button', { name: /Копировать/ }).innerText();
    await organizerPage.getByLabel('Email или ID пользователя').fill(publicId.match(/#[0-9]+/)![0]);
    await organizerPage.getByRole('button', { name: 'Выдать права' }).click();
    await expect(organizerPage.getByText(volunteer.name, { exact: true })).toBeVisible();

    const svg = await existingGuest.getByRole('button', { name: 'Развернуть QR-код на весь экран' })
      .locator('svg').first().evaluate((element) => new XMLSerializer().serializeToString(element));
    await volunteerPage.addInitScript((markup) => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async (): Promise<MediaStream> => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 400;
          const context = canvas.getContext('2d')!;
          const image = new Image();
          image.src = `data:image/svg+xml,${encodeURIComponent(markup)}`;
          await image.decode();
          const drawFrame = (): void => {
            context.fillStyle = '#fff';
            context.fillRect(0, 0, 400, 400);
            context.drawImage(image, 40, 40, 320, 320);
          };
          drawFrame();
          setInterval(drawFrame, 100);
          return canvas.captureStream(10);
        },
      });
    }, svg);

    await volunteerPage.goto('/events?tab=volunteering');
    await expect(volunteerPage.getByRole('heading', { name: eventTitle })).toBeVisible();
    await expect(volunteerPage.getByRole('tab', { name: /Организую|Черновики/ })).toHaveCount(0);
    await expect(volunteerPage.getByRole('link', { name: 'Дашборд', exact: true })).toHaveCount(0);
    await volunteerPage.getByRole('link', { name: /сканер/i }).click();
    await volunteerPage.getByRole('button', { name: 'Включить камеру' }).click();
    await expect(volunteerPage.getByRole('heading', { name: 'Проход разрешён' })).toBeVisible();
    await expect(volunteerPage.getByText('Проверено вами: 1', { exact: false })).toBeVisible();
    await checkManual(volunteerPage, attendeeTicket.code, 'Билет уже использован');
    await checkManual(volunteerPage, guestRegistration.ticket.code, 'Билет недействителен');
    await expect(volunteerPage.getByText('Регистрация отменена', { exact: true }).first()).toBeVisible();
  });

  await test.step('check dashboard, export answers, edit event and revoke rights', async () => {
    await organizerPage.goto(`/events/${event.id}/dashboard`);
    await expect(organizerPage.getByText(volunteer.email)).toBeVisible();
    await organizerPage.getByRole('textbox', { name: 'Поиск участников' }).fill('не найден');
    await expect(organizerPage.getByText(volunteer.email)).toHaveCount(0);
    await organizerPage.getByRole('textbox', { name: 'Поиск участников' }).fill(volunteer.email);
    await expect(organizerPage.getByText(volunteer.email)).toBeVisible();
    const csvPromise = organizerPage.waitForEvent('download');
    await organizerPage.getByRole('button', { name: 'Экспорт в Excel' }).click();
    const csv = await readFile((await (await csvPromise).path())!, 'utf8');
    expect(csv).toContain('Ваш город');
    expect(csv).toContain('Казань');
    expect(csv).toContain('Москва');
    expect(csv).toContain('Практика, Лекции');

    await organizerPage.goto(`/events/${event.id}/edit`);
    await organizerPage.getByLabel('Место / аудитория').fill('Обновлённый зал');
    await organizerPage.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(organizerPage).toHaveURL(/\/events$/);
    await organizerPage.goto(`/events/${event.id}/volunteers`);
    await organizerPage.getByRole('button', { name: 'Отозвать', exact: true }).click();
    await organizerPage.getByRole('dialog').getByRole('button', { name: 'Отозвать', exact: true }).click();
    await expect(organizerPage.getByText('Волонтёров пока нет')).toBeVisible();
    await expect(volunteerPage).toHaveURL(/tab=volunteering/, { timeout: 15_000 });
    await expect(volunteerPage.getByRole('tab', { name: /Волонтёр/ })).toHaveCount(0);
  });

  await test.step('reset password and delete the account', async () => {
    await guestPage.goto('/profile');
    await guestPage.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await guestPage.getByRole('link', { name: 'Забыли пароль?' }).click();
    await expect(guestPage.getByRole('heading', { name: 'Восстановление пароля' })).toBeVisible();
    await guestPage.getByLabel('Email').fill(guest.email);
    await guestPage.getByRole('button', { name: 'Отправить ссылку' }).click();
    await expect(guestPage.getByText(/Если аккаунт существует/)).toBeVisible();
    const resetLink = await getMailLink(request, guest.email, 'Восстановление пароля EventPass', 'reset');
    await guestPage.goto(resetLink);
    guest.password += '-new';
    await guestPage.getByLabel('Новый пароль').fill(guest.password);
    await guestPage.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(guestPage.getByRole('heading', { name: 'Вход в EventPass' })).toBeVisible();
    await logIn(guestPage, guest);
    await guestPage.goto('/profile');
    await guestPage.getByRole('button', { name: 'Удалить аккаунт' }).click();
    await guestPage.getByRole('button', { name: 'Удалить навсегда' }).click();
    await expect(guestPage.getByRole('heading', { name: 'Вход в EventPass' })).toBeVisible();
  });

  for (const user of [organizer, volunteer]) {
    const response = await request.post('/api/auth/login', { data: { email: user.email, password: user.password } });
    const { token }: { token: string } = await response.json();
    expect((await request.delete('/api/me', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(204);
  }
  expect(unexpectedErrors).toEqual([]);
  await Promise.all([volunteerPage, organizerPage, guestPage, existingGuest].map((page) => page.close()));
});
