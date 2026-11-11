import { apiConfig } from '../config';
import { ApiError, type ApiErrorCode } from '../errors';
import { notifyUnauthorized, tokenStorage } from '../tokenStorage';

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Вернуть Blob (файлы экспорта), а не JSON. */
  responseType?: 'json' | 'blob';
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const base = apiConfig.baseUrl.replace(/\/$/, '');
  const url = `${base}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'UNKNOWN',
  422: 'VALIDATION',
};

/**
 * Ожидаемый формат ошибки бэкенда:
 *   { "code": "EMAIL_TAKEN", "message": "...", "fields": { "email": "..." } }
 * Если бэкенд отвечает иначе — поправить разбор здесь, в одном месте.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let payload: { code?: string; message?: string; fields?: Record<string, string> } = {};
  try {
    payload = await response.json();
  } catch {
    /* тело не JSON */
  }
  const code = (payload.code as ApiErrorCode | undefined) ?? STATUS_TO_CODE[response.status] ?? 'UNKNOWN';
  return new ApiError(code, payload.message ?? `Ошибка сервера (${response.status})`, response.status, payload.fields);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, responseType = 'json', signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError('NETWORK', 'Нет соединения с сервером');
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.code === 'UNAUTHORIZED') notifyUnauthorized();
    throw error;
  }

  if (response.status === 204) return undefined as T;
  if (responseType === 'blob') return (await response.blob()) as T;
  return (await response.json()) as T;
}
