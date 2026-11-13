import { apiConfig } from './config';
import type { Api } from './contract';
import { httpApi } from './http/httpApi';
import { mockApi } from './mock/mockApi';

/**
 * Точка входа к данным. Остальной код импортирует только `api`.
 *
 *   VITE_API_MODE=mock → встроенные моки (по умолчанию)
 *   VITE_API_MODE=http → настоящий бэкенд по адресу VITE_API_URL
 */
export const api: Api = apiConfig.mode === 'http' ? httpApi : mockApi;

export { apiConfig } from './config';
export * from './errors';
export { OPTION_QUESTION_TYPES } from './types';
export type * from './types';
