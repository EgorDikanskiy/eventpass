import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, email = 'ivan@example.com') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/tickets$/);
}
const routes = ['/tickets', '/tickets?tab=past', '/profile', '/events', '/events?tab=drafts', '/events?tab=volunteering', '/events/new', '/events/e_draft/edit', '/events/e_devfest/dashboard', '/events/e_devfest/volunteers', '/events/e_devfest/published', '/events/e_itds/scanner', '/e/it-ds-2025'];
for (const width of [320, 390, 768, 1280]) {
  test(`authenticated screens fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await login(page);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
      await expect(page.getByRole('status', { name: 'Загрузка', exact: true })).toHaveCount(0);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(route);
      await page.screenshot({ path: info.outputPath(route.replace(/[^a-z0-9]/gi, '_') + '.png'), fullPage: true });
      const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(e => `${e.tagName}.${e.className}`) }));
      expect.soft(overflow.scroll, `${route}: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(width + 1);
    }
    expect(errors).toEqual([]);
  });
  test(`guest screens fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/login', '/register', '/forgot-password', '/account-link', '/e/it-ds-2025', '/e/devfest-2026', '/missing']) {
      await page.goto(route);
      await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
      await page.screenshot({ path: info.outputPath(route.replace(/[^a-z0-9]/gi, '_') + '.png'), fullPage: true });
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(width + 1);
    }
  });
}
test('guest registration, QR dialog and reload', async ({ page }) => {
  await page.goto('/e/devfest-2026');
  await page.getByRole('button', { name: 'Получить QR-билет' }).click();
  await expect(page.getByText('Укажите имя и фамилию')).toBeVisible();
  await page.getByLabel('Имя и фамилия').fill('Тест Гость');
  await page.getByLabel(/^Email/).fill('guest-qa@example.com');
  await page.getByRole('checkbox', { name: /Я согласен/ }).check();
  await page.getByRole('button', { name: 'Получить QR-билет' }).click();
  await expect(page.getByText('Вы зарегистрированы')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Развернуть QR-код на весь экран' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('ticket cancellation confirmation fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page);
  await page.getByRole('button', { name: 'Отменить регистрацию', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
test('organizer validation, preview, save draft and publish', async ({ page }) => {
  await login(page);
  await page.goto('/events/new');
  await page.getByLabel('Название мероприятия').fill('QA Event');
  await page.getByLabel('Описание').fill('QA Description');
  await page.getByLabel('Дата начала').fill('2027-12-01');
  await page.getByLabel('Место / аудитория').fill('QA Hall');
  await page.getByRole('button', { name: 'Предпросмотр' }).click();
  await expect(page.getByRole('dialog').getByLabel('Имя и фамилия')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await expect(page).toHaveURL(/tab=drafts/);
  await page.locator('article').filter({ hasText: 'QA Event' }).getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByText('Мероприятие опубликовано', { exact: true })).toBeVisible();
});
test('guards and invalid credentials', async ({ page }) => {
  await page.goto('/events/new');
  await expect(page).toHaveURL(/login\?returnUrl/);
  await page.getByLabel('Email').fill('alexey@example.com');
  await page.getByLabel('Пароль', { exact: true }).fill('bad');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Неверная почта или пароль')).toBeVisible();
  await page.getByLabel('Пароль', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  for (const route of ['edit', 'dashboard', 'volunteers', 'scanner']) {
    await page.goto(`/events/e_itds/${route}`);
    await expect(page).toHaveURL(/\/events(?:\?tab=volunteering)?$/);
  }
});


test('new account preserves the destination from a protected route', async ({ page }) => {
  await page.goto('/events/new');
  await page.getByRole('link', { name: 'Зарегистрироваться', exact: true }).click();
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByText('Укажите имя и фамилию')).toBeVisible();
  await page.getByLabel('Имя и фамилия').fill('Новый Пользователь');
  await page.getByLabel('Email').fill('new-qa@example.com');
  await page.getByLabel(/^Пароль/).fill('password-qa');
  await page.getByRole('checkbox', { name: /Я согласен/ }).check();
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
});
test('profile persists, logout and account deletion', async ({ page }) => {
  await login(page, 'alexey@example.com');
  await page.goto('/profile');
  await page.getByLabel('Вуз / Компания').fill('QA University');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Изменения сохранены')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Вуз / Компания')).toHaveValue('QA University');
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await expect(page).toHaveURL(/\/login(?:\?returnUrl=.*)?$/);
  await login(page, 'alexey@example.com');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Удалить аккаунт', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить навсегда' }).click();
  await expect(page).toHaveURL(/\/login(?:\?returnUrl=.*)?$/);
});
test('participant registers and cancels a ticket', async ({ page }) => {
  await login(page, 'alexey@example.com');
  await page.goto('/e/devfest-2026');
  await page.getByRole('checkbox', { name: /Я согласен/ }).check();
  await page.getByRole('button', { name: 'Получить QR-билет' }).click();
  await expect(page).toHaveURL(/\/tickets\?ticket=/);
  await page.getByRole('button', { name: 'Отменить регистрацию', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отменить регистрацию', exact: true }).click();
  await page.getByRole('tab', { name: /Прошедшие/ }).click();
  await expect(page.getByText('Отменён', { exact: true })).toBeVisible();
});
test('existing guest email resumes registration after login', async ({ page }) => {
  await page.goto('/e/devfest-2026');
  await page.getByLabel('Имя и фамилия').fill('Алексей');
  await page.getByLabel(/^Email/).fill('alexey@example.com');
  await page.getByRole('checkbox', { name: /Я согласен/ }).check();
  await page.getByRole('button', { name: 'Получить QR-билет' }).click();
  await expect(page.getByText('У вас уже есть аккаунт')).toBeVisible();
  await page.getByLabel('Пароль', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Войти и завершить регистрацию' }).click();
  await expect(page).toHaveURL(/\/tickets\?ticket=/);
});
test('volunteer scans active, duplicate, cancelled and unknown tickets', async ({ page }) => {
  await login(page);
  await page.goto('/events/e_itds/scanner');
  const active = page.getByRole('button', { name: /^EVT-/ }).first();
  const code = (await active.innerText()).split(' ')[0];
  await active.click();
  await expect(page.getByRole('heading', { name: 'Проход разрешён' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Код билета' }).fill(code);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Билет уже использован' })).toBeVisible();
  await page.getByRole('button', { name: /EVT-.*отменён/ }).click();
  await expect(page.getByRole('heading', { name: 'Билет недействителен' })).toBeVisible();
  await page.getByRole('button', { name: /EVT-000000/ }).click();
  await expect(page.getByRole('heading', { name: 'Билет недействителен' })).toBeVisible();
  await page.getByRole('button', { name: 'Сканировать следующий' }).click();
  await expect(page.getByRole('heading', { name: 'Ожидание сканирования' })).toBeVisible();
});
test('organizer grants and revokes volunteer rights', async ({ page }) => {
  await login(page);
  await page.goto('/events/e_devfest/volunteers');
  await page.getByLabel('Email или ID пользователя').fill('517204');
  await page.getByRole('button', { name: 'Выдать права' }).click();
  const row = page.locator('li').filter({ hasText: 'alexey@example.com' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Отозвать', exact: true }).click();
  await page.getByRole('dialog', { name: 'Отозвать права?' }).getByRole('button', { name: 'Отозвать', exact: true }).click();
  await expect(row).toHaveCount(0);
});
test('dashboard pagination, search and export', async ({ page }) => {
  await login(page);
  await page.goto('/events/e_devfest/dashboard');
  await page.getByRole('button', { name: 'Вперёд', exact: true }).click();
  await expect(page.getByText('2 / 4', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Поиск участников' }).fill('zzzznoresult');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).not.toContainText('@');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт в Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});
test('description validation is shown beside the field', async ({ page }) => {
  await login(page);
  await page.goto('/events/new');
  await page.getByRole('button', { name: /Опубликовать/ }).click();
  await expect(page.getByText('Добавьте описание', { exact: true })).toBeVisible();
});


test('auth forms reject external return URLs', async ({ page }) => {
  await page.goto('/login?returnUrl=' + encodeURIComponent('//example.com'));
  await page.getByRole('link', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.goto('/register?returnUrl=' + encodeURIComponent('/\\example.com'));
  await page.getByRole('link', { name: 'Войти', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});
test('mobile question editor supports choices, reordering and preview', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page);
  await page.goto('/events/new');
  await page.getByRole('button', { name: 'Добавить вопрос' }).click();
  await page.getByRole('textbox', { name: 'Текст вопроса' }).last().fill('Темы');
  await page.getByRole('combobox', { name: 'Тип ответа' }).last().selectOption('multiple');
  await page.getByRole('textbox', { name: 'Вариант 1', exact: true }).fill('Фронтенд');
  await page.getByRole('textbox', { name: 'Вариант 2', exact: true }).fill('Бэкенд');
  await page.getByRole('button', { name: 'Поднять вопрос 2' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await page.getByRole('button', { name: 'Предпросмотр' }).click();
  const dialog = page.getByRole('dialog', { name: 'Предпросмотр анкеты' });
  await dialog.getByRole('checkbox', { name: 'Фронтенд' }).check();
  await dialog.getByRole('checkbox', { name: 'Бэкенд' }).check();
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Получить QR-билет' })).toBeDisabled();
  await dialog.getByRole('tab', { name: 'Участник' }).click();
  await expect(dialog.getByLabel('Имя и фамилия')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
