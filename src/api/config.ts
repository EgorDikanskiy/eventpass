export type ApiMode = 'mock' | 'http';

export const apiConfig = {
  mode: (import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock') as ApiMode,
  baseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api',
  mockDelay: Number(import.meta.env.VITE_MOCK_DELAY ?? 350),
};
