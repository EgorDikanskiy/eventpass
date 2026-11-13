import type { Question } from '../types';
import type { DbEvent, DbScan, DbTicket, DbUser, DbVolunteer, MockDb } from './db';
import { relativeDate } from './utils';

/**
 * Исходные демо-данные. Даты считаются от текущего момента, поэтому
 * «идёт сейчас», «через 4 дня» и «прошедшие» всегда выглядят как в макетах.
 *
 * Демо-аккаунты (пароль у всех — `password`):
 *   ivan@example.com  — участник, волонтёр и организатор (основной сценарий)
 *   maria@example.com — организатор «IT & Data Science 2025» и хакатона
 *   alexey@example.com — пользователь без мероприятий (для выдачи прав волонтёра)
 */

// Детерминированный генератор, чтобы демо-данные были одинаковыми при каждом сбросе.
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const FIRST_M = ['Алексей', 'Дмитрий', 'Сергей', 'Никита', 'Артём', 'Максим', 'Илья', 'Егор', 'Кирилл', 'Павел'];
const LAST_M = ['Борисов', 'Васильев', 'Рыбаков', 'Кузнецов', 'Орлов', 'Зайцев', 'Морозов', 'Волков', 'Соловьёв', 'Лебедев'];
const FIRST_F = ['Елена', 'Ирина', 'Анастасия', 'Мария', 'Дарья', 'Ольга', 'Полина', 'Ксения', 'Алина', 'Софья'];
const LAST_F = ['Миронова', 'Ковалёва', 'Смирнова', 'Попова', 'Новикова', 'Фёдорова', 'Морозова', 'Белова', 'Тихонова', 'Егорова'];
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const DOMAINS = ['mail.ru', 'yandex.ru', 'gmail.com', 'techcorp.ru', 'edu.mospolytech.ru'];

function translit(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
}

const formatQuestion: Question = {
  id: 'q_format',
  label: 'Формат участия',
  type: 'choice',
  required: true,
  options: [
    { value: 'listener', label: 'Слушатель', hint: 'Посещение всех залов' },
    { value: 'speaker', label: 'Докладчик', hint: 'С защитой работы' },
  ],
};

const universityQuestion: Question = {
  id: 'q_university',
  label: 'Вуз / Факультет',
  type: 'text',
  required: false,
  placeholder: 'МГУ, ВМК, 3 курс',
};

export function createSeed(version: number): Omit<MockDb, 'seededOn'> {
  const rand = prng(20251024);

  // «Сегодняшние» мероприятия начинаются чуть раньше текущего момента, поэтому они
  // всегда «идут сейчас» — когда бы вы ни открыли приложение (утром или ночью).
  const liveStart = new Date();
  liveStart.setSeconds(0, 0);
  liveStart.setMinutes(liveStart.getMinutes() < 30 ? 0 : 30);
  liveStart.setTime(liveStart.getTime() - 60 * 60_000); // начало — 60–90 минут назад
  /** Момент через `minutes` минут после начала «сегодняшних» мероприятий. */
  const live = (minutes: number, seconds = 0) =>
    new Date(liveStart.getTime() + minutes * 60_000 + seconds * 1000).toISOString();

  const users: DbUser[] = [
    {
      id: 'u_ivan',
      publicId: '482193',
      fullName: 'Иван Петров',
      email: 'ivan@example.com',
      phone: '+7 (999) 000-00-00',
      organization: 'МГУ, ВМК, 3 курс',
      emailVerified: true,
      notificationsEnabled: true,
      password: 'password',
    },
    {
      id: 'u_maria',
      publicId: '305771',
      fullName: 'Мария Соколова',
      email: 'maria@example.com',
      phone: '+7 (916) 123-45-67',
      organization: 'Московский Политех',
      emailVerified: true,
      notificationsEnabled: true,
      password: 'password',
    },
    {
      id: 'u_alexey',
      publicId: '517204',
      fullName: 'Алексей Борисов',
      email: 'alexey@example.com',
      phone: null,
      organization: 'TechCorp',
      emailVerified: true,
      notificationsEnabled: false,
      password: 'password',
    },
  ];

  const events: DbEvent[] = [
    {
      id: 'e_itds',
      slug: 'it-ds-2025',
      title: 'IT & Data Science 2025',
      description:
        'Ежегодная студенческая научно-практическая конференция. Передовые исследования, прикладные ML-модели, воркшопы от лидеров индустрии и защита кейсов.',
      category: 'Международная конференция',
      status: 'published',
      startsAt: live(0),
      durationHours: 12,
      location: 'Главный корпус, ауд. 301',
      checkpoint: 'КПП-1',
      capacity: 120,
      priceType: 'free',
      coverUrl: '/mock/covers/it-ds.jpg',
      coverCaption: 'Сертифицированные доклады • 12 спикеров',
      coverBadge: 'Сессия 2025',
      sections: [
        { id: 's1', title: 'LLM & Generative AI', time: '10:30 — 13:00' },
        { id: 's2', title: 'Data Engineering & ML Ops', time: '14:00 — 17:30' },
      ],
      questions: [formatQuestion, universityQuestion],
      organizerId: 'u_maria',
      createdAt: relativeDate(-30, 12),
    },
    {
      id: 'e_hack',
      slug: 'cyber-hackathon',
      title: 'Хакатон: Кибербезопасность АСУ ТП',
      description:
        'Командный хакатон по защите промышленных систем управления: 24 часа, реальные стенды и разбор атак с экспертами.',
      category: 'Хакатон',
      status: 'published',
      startsAt: relativeDate(4, 14),
      durationHours: 24,
      location: 'Инжиниринговый центр (Корпус B)',
      capacity: 80,
      priceType: 'free',
      coverUrl: null,
      sections: [
        { id: 's1', title: 'Открытие и постановка задач', time: '14:00 — 15:00' },
        { id: 's2', title: 'Работа команд', time: '15:00 — 12:00' },
      ],
      questions: [{ ...universityQuestion }],
      organizerId: 'u_maria',
      createdAt: relativeDate(-20, 12),
    },
    {
      id: 'e_conf',
      slug: 'vserossiyskaya-it-ds',
      title: 'Всероссийская конференция IT & Data Science',
      description: 'Всероссийская конференция для студентов и молодых исследователей в области данных.',
      category: 'Конференция',
      status: 'published',
      startsAt: live(-30),
      durationHours: 12,
      location: 'Главный лекторий',
      checkpoint: 'КПП-1',
      capacity: 250,
      priceType: 'free',
      coverUrl: '/mock/covers/it-ds.jpg',
      sections: [{ id: 's1', title: 'Пленарная сессия', time: '10:00 — 12:00' }],
      questions: [formatQuestion, universityQuestion],
      organizerId: 'u_ivan',
      createdAt: relativeDate(-40, 12),
    },
    {
      id: 'e_devfest',
      slug: 'devfest-2026',
      title: 'DevFest Студенческий форум',
      description: 'Форум студенческих команд разработки: доклады, ярмарка проектов и нетворкинг.',
      category: 'Форум',
      status: 'published',
      startsAt: relativeDate(30, 11),
      durationHours: 8,
      location: 'Инкубатор Технопарка, Большой лекторий',
      capacity: 200,
      priceType: 'free',
      coverUrl: null,
      sections: [],
      questions: [universityQuestion, { id: 'q_course', label: 'Курс обучения', type: 'text', required: false, placeholder: '3 курс' }],
      organizerId: 'u_ivan',
      createdAt: relativeDate(-5, 12),
    },
    {
      id: 'e_draft',
      slug: 'frontend-meetup',
      title: 'Весенний митап фронтенд-разработчиков',
      description: 'Черновик: доклады про React, производительность и дизайн-системы.',
      category: 'Митап',
      status: 'draft',
      startsAt: relativeDate(60, 18, 30),
      durationHours: 3,
      location: 'Коворкинг «Точка кипения»',
      capacity: 60,
      priceType: 'free',
      coverUrl: null,
      sections: [],
      questions: [],
      organizerId: 'u_ivan',
      createdAt: relativeDate(-1, 12),
    },
    // Прошедшие — для вкладки «Прошедшие» в «Мои билеты»
    {
      id: 'e_past1',
      slug: 'react-in-production',
      title: 'Митап «React в продакшене»',
      description: 'Опыт команд, которые запускают React-приложения под нагрузкой.',
      category: 'Митап',
      status: 'published',
      startsAt: relativeDate(-20, 19),
      durationHours: 3,
      location: 'Технопарк, зал 2',
      capacity: 100,
      priceType: 'free',
      coverUrl: null,
      sections: [],
      questions: [],
      organizerId: 'u_maria',
      createdAt: relativeDate(-50, 12),
    },
    {
      id: 'e_past2',
      slug: 'algo-olympiad',
      title: 'Олимпиада по алгоритмам',
      description: 'Командная олимпиада по спортивному программированию.',
      category: 'Олимпиада',
      status: 'published',
      startsAt: relativeDate(-45, 11),
      durationHours: 5,
      location: 'Корпус на Автозаводской, ауд. 1210',
      capacity: 60,
      priceType: 'free',
      coverUrl: null,
      sections: [],
      questions: [],
      organizerId: 'u_maria',
      createdAt: relativeDate(-80, 12),
    },
    {
      id: 'e_past3',
      slug: 'ml-summer-school',
      title: 'Летняя школа машинного обучения',
      description: 'Интенсив по классическому ML и нейросетям.',
      category: 'Образовательная программа',
      status: 'published',
      startsAt: relativeDate(-90, 10),
      durationHours: 8,
      location: 'Главный корпус, ауд. 301',
      capacity: 40,
      priceType: 'paid',
      coverUrl: null,
      sections: [],
      questions: [],
      organizerId: 'u_maria',
      createdAt: relativeDate(-120, 12),
    },
  ];

  const tickets: DbTicket[] = [];
  let tokenCounter = 0;
  const token = () => `ep1.demo${(++tokenCounter).toString(16).padStart(6, '0')}`;
  let codeCounter = 849000;
  const nextCode = () => `EVT-${++codeCounter}`;

  function makeTicket(partial: Partial<DbTicket> & Pick<DbTicket, 'eventId' | 'holderName' | 'holderEmail'>): DbTicket {
    const ticket: DbTicket = {
      id: `t_${tickets.length + 1}`,
      code: nextCode(),
      qrToken: token(),
      userId: null,
      status: 'active',
      category: 'Слушатель',
      zone: 'Входная зона: КПП-1',
      answers: {},
      createdAt: relativeDate(-7, 12),
      checkedInAt: null,
      checkedInBy: null,
      ...partial,
    };
    tickets.push(ticket);
    return ticket;
  }

  // --- Билеты Ивана ---
  makeTicket({
    eventId: 'e_itds',
    userId: 'u_ivan',
    code: 'EVT-849102',
    qrToken: 'ep1.ivan-itds',
    holderName: 'Иван Петров',
    holderEmail: 'ivan@example.com',
    category: 'Студент / Full Pass',
    answers: { q_format: 'listener', q_university: 'МГУ, ВМК, 3 курс' },
  });
  makeTicket({
    eventId: 'e_hack',
    userId: 'u_ivan',
    code: 'EVT-902341',
    qrToken: 'ep1.ivan-hack',
    holderName: 'Иван Петров',
    holderEmail: 'ivan@example.com',
    category: 'Участник команды',
    zone: 'Вход: Корпус B',
  });
  makeTicket({
    eventId: 'e_past1',
    userId: 'u_ivan',
    holderName: 'Иван Петров',
    holderEmail: 'ivan@example.com',
    status: 'used',
    checkedInAt: relativeDate(-20, 18, 52),
  });
  makeTicket({
    eventId: 'e_past2',
    userId: 'u_ivan',
    holderName: 'Иван Петров',
    holderEmail: 'ivan@example.com',
  });
  makeTicket({
    eventId: 'e_past3',
    userId: 'u_ivan',
    holderName: 'Иван Петров',
    holderEmail: 'ivan@example.com',
    status: 'used',
    checkedInAt: relativeDate(-90, 9, 47),
  });

  // --- Участники «IT & Data Science 2025» (для сканера волонтёра) ---
  makeTicket({
    eventId: 'e_itds',
    code: 'EVT-849077',
    qrToken: 'ep1.alexey-itds',
    holderName: 'Алексей Борисов',
    holderEmail: 'a.borisov@techcorp.ru',
    status: 'used',
    checkedInAt: live(44),
    checkedInBy: 'u_ivan',
  });
  makeTicket({
    eventId: 'e_itds',
    code: 'EVT-849081',
    qrToken: 'ep1.elena-itds',
    holderName: 'Елена Миронова',
    holderEmail: 'mironova.elena@yandex.ru',
    status: 'used',
    checkedInAt: live(41),
    checkedInBy: 'u_ivan',
  });
  makeTicket({
    eventId: 'e_itds',
    code: 'EVT-849090',
    qrToken: 'ep1.irina-itds',
    holderName: 'Ирина Ковалёва',
    holderEmail: 'irina.kovaleva@mail.ru',
  });
  makeTicket({
    eventId: 'e_itds',
    code: 'EVT-849095',
    qrToken: 'ep1.cancelled-itds',
    holderName: 'Павел Орлов',
    holderEmail: 'p.orlov@gmail.com',
    status: 'cancelled',
  });

  // --- Массовка: генерируем участников, чтобы дашборды выглядели как в макете ---
  function randomPerson() {
    const female = rand() < 0.5;
    const first = (female ? FIRST_F : FIRST_M)[Math.floor(rand() * 10)];
    const last = (female ? LAST_F : LAST_M)[Math.floor(rand() * 10)];
    const email = `${translit(first)[0]}.${translit(last)}${Math.floor(rand() * 90 + 10)}@${DOMAINS[Math.floor(rand() * DOMAINS.length)]}`;
    return { name: `${first} ${last}`, email };
  }

  /** Добивает мероприятие участниками до `total`, из них `checkedIn` уже прошли; `checkinAt` — время прохода по минуте. */
  function fill(eventId: string, total: number, checkedIn: number, checkinAt: (minute: number) => string) {
    const own = tickets.filter((t) => t.eventId === eventId && t.status !== 'cancelled');
    let checked = own.filter((t) => t.status === 'used').length;
    for (let i = own.length; i < total; i++) {
      const person = randomPerson();
      const isChecked = checked < checkedIn;
      if (isChecked) checked++;
      const minute = Math.floor(rand() * 55);
      makeTicket({
        eventId,
        holderName: person.name,
        holderEmail: person.email,
        category: rand() < 0.85 ? 'Слушатель' : 'Докладчик',
        status: isChecked ? 'used' : 'active',
        checkedInAt: isChecked ? checkinAt(minute) : null,
        answers: { q_format: rand() < 0.85 ? 'listener' : 'speaker' },
      });
    }
  }

  // Организатор Иван: 242 / 250, явка 184 (как на дашборде в макете)
  const conf = [
    { name: 'Алексей Борисов', email: 'a.borisov@techcorp.ru', at: [58, 2] },
    { name: 'Елена Миронова', email: 'mironova.elena@yandex.ru', at: [57, 45] },
    { name: 'Дмитрий Васильев', email: 'dmitry.v@datascience.team', at: [56, 19] },
    { name: 'Ирина Ковалёва', email: 'irina.kovaleva@mail.ru', at: null },
    { name: 'Сергей Рыбаков', email: 'rybakov_s@fintechlab.io', at: [55, 30] },
    { name: 'Анастасия Смирнова', email: 'smirnova_a@devstudio.com', at: null },
  ];
  for (const person of conf) {
    const at = person.at ? live(person.at[0], person.at[1]) : null;
    makeTicket({
      eventId: 'e_conf',
      holderName: person.name,
      holderEmail: person.email,
      status: at ? 'used' : 'active',
      checkedInAt: at,
      answers: { q_format: 'listener' },
    });
  }
  const never = () => relativeDate(0, 0);
  fill('e_conf', 242, 184, (m) => live(m));
  fill('e_itds', 112, 64, (m) => live(m));
  fill('e_hack', 45, 0, never);
  fill('e_devfest', 37, 0, never);
  fill('e_past1', 70, 58, (m) => relativeDate(-20, 18, m));
  fill('e_past2', 40, 31, (m) => relativeDate(-45, 10, m));
  fill('e_past3', 38, 36, (m) => relativeDate(-90, 9, m));

  const volunteers: DbVolunteer[] = [
    { eventId: 'e_itds', userId: 'u_ivan', grantedAt: relativeDate(-3, 15) },
    { eventId: 'e_hack', userId: 'u_ivan', grantedAt: relativeDate(-2, 15) },
    { eventId: 'e_conf', userId: 'u_maria', grantedAt: relativeDate(-6, 15) },
  ];

  const scans: DbScan[] = [
    {
      id: 'sc_1',
      eventId: 'e_itds',
      scannedBy: 'u_ivan',
      scannedAt: live(40),
      result: 'invalid',
      ticketId: null,
      note: 'билет не найден',
    },
    {
      id: 'sc_2',
      eventId: 'e_itds',
      scannedBy: 'u_ivan',
      scannedAt: live(42),
      result: 'already_used',
      ticketId: 't_7',
      note: `уже проходила в ${new Date(live(41)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
    },
    {
      id: 'sc_3',
      eventId: 'e_itds',
      scannedBy: 'u_ivan',
      scannedAt: live(44),
      result: 'allowed',
      ticketId: 't_6',
      note: '',
    },
  ];

  return { version, users, events, tickets, volunteers, scans };
}
