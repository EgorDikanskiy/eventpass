import type { Answers, EventSection, PriceType, Question, TicketStatus } from '../types';
import { createSeed } from './seed';

/**
 * «База данных» моков. Хранится в localStorage, поэтому изменения
 * (регистрации, сканирования, новые мероприятия) переживают перезагрузку.
 * Сбросить к исходным данным: `resetMockDb()` или кнопка «Сбросить демо-данные» в подвале.
 */

export interface DbUser {
  id: string;
  publicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  emailVerified: boolean;
  notificationsEnabled: boolean;
  /** Только для моков! На реальном бэке пароль не покидает сервер. */
  password: string | null;
}

export interface DbEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  /** draft | published. Статусы live / finished вычисляются по дате. */
  status: 'draft' | 'published';
  startsAt: string | null;
  durationHours: number;
  location: string;
  checkpoint?: string;
  capacity: number | null;
  priceType: PriceType;
  coverUrl: string | null;
  coverCaption?: string;
  coverBadge?: string;
  sections: EventSection[];
  questions: Question[];
  organizerId: string;
  createdAt: string;
}

export interface DbTicket {
  id: string;
  code: string;
  qrToken: string;
  eventId: string;
  userId: string | null;
  holderName: string;
  holderEmail: string;
  status: TicketStatus;
  category: string;
  zone: string;
  answers: Answers;
  createdAt: string;
  checkedInAt: string | null;
  checkedInBy: string | null;
}

export interface DbVolunteer {
  eventId: string;
  userId: string;
  grantedAt: string;
}

export interface DbScan {
  id: string;
  eventId: string;
  scannedBy: string;
  scannedAt: string;
  result: 'allowed' | 'already_used' | 'invalid';
  ticketId: string | null;
  note: string;
}

export interface MockDb {
  version: number;
  /** День, на который построены демо-данные (YYYY-MM-DD). */
  seededOn: string;
  users: DbUser[];
  events: DbEvent[];
  tickets: DbTicket[];
  volunteers: DbVolunteer[];
  scans: DbScan[];
}

const STORAGE_KEY = 'eventpass.mockdb';
const DB_VERSION = 3;

let db: MockDb | null = null;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      // Даты демо-данных считаются от «сегодня». На следующий день «сегодняшние»
      // мероприятия стали бы прошедшими, поэтому раз в день данные пересоздаются.
      if (parsed.version === DB_VERSION && parsed.seededOn === today()) return parsed;
    }
  } catch {
    /* битые данные — пересоздаём */
  }
  return { ...createSeed(DB_VERSION), seededOn: today() };
}

export function getDb(): MockDb {
  if (!db) db = load();
  return db;
}

export function saveDb(): void {
  if (!db) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* переполнен localStorage — данные останутся только в памяти */
  }
}

export function resetMockDb(): void {
  db = { ...createSeed(DB_VERSION), seededOn: today() };
  saveDb();
}
