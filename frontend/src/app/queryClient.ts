import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 401/403/404 повторять бессмысленно
      retry: (failureCount, error) =>
        !isApiError(error, 'UNAUTHORIZED') &&
        !isApiError(error, 'FORBIDDEN') &&
        !isApiError(error, 'NOT_FOUND') &&
        failureCount < 2,
    },
  },
});
