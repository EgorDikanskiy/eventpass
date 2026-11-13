import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { queryKeys } from './queryKeys';

export function useScannerInfo(eventId: string) {
  return useQuery({
    queryKey: queryKeys.scanner(eventId),
    queryFn: () => api.scanner.getInfo(eventId),
    refetchInterval: 10_000,
  });
}

export function useScan(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.scanner.scan(eventId, code),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scanner(eventId) });
      queryClient.invalidateQueries({ queryKey: ['organizer', eventId] });
    },
  });
}
