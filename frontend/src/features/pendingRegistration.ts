import type { Answers } from '@/api';

/**
 * Регистрация, прерванная на «почта уже зарегистрирована».
 * Передаётся на экран входа через `location.state`, чтобы после входа
 * завершить регистрацию автоматически с сохранёнными ответами.
 */
export interface PendingRegistration {
  eventId: string;
  slug: string;
  eventTitle: string;
  email: string;
  answers: Answers;
  consentAccepted: boolean;
  phone: string;
  fullName: string;
}

export interface LoginLocationState {
  pendingRegistration?: PendingRegistration;
  /** Почта для подстановки в форму. */
  email?: string;
}
