/**
 * Тестовые аккаунты моков. Те же данные — в docs/MOCKS.md.
 * Используются демо-панелью и подсказкой на экране входа (только в режиме mock).
 */
export const DEMO_PASSWORD = 'password';

export const DEMO_ACCOUNTS = [
  { email: 'ivan@example.com', name: 'Иван Петров', note: 'на разных мероприятиях — участник, волонтёр и организатор' },
  { email: 'maria@example.com', name: 'Мария Соколова', note: 'организатор «IT & Data Science 2025» и хакатона' },
  { email: 'alexey@example.com', name: 'Алексей Борисов', note: 'новичок: ни билетов, ни своих мероприятий' },
] as const;
