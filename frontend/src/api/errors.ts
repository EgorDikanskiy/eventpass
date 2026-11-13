/**
 * Ошибка API в едином формате — и для моков, и для HTTP.
 * Компоненты проверяют `code`, а не текст сообщения.
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED' // нет или протух токен → редирект на вход
  | 'FORBIDDEN' // нет прав на мероприятие
  | 'NOT_FOUND'
  | 'VALIDATION' // ошибки полей, подробности в `fields`
  | 'EMAIL_TAKEN' // гость ввёл почту существующего аккаунта
  | 'INVALID_CREDENTIALS'
  | 'ALREADY_REGISTERED'
  | 'EVENT_FULL'
  | 'NETWORK'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(code: ApiErrorCode, message: string, status = 0, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** Человекочитаемое сообщение для любой ошибки. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}
