import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AttendeesQuery } from '@/api';
import { queryKeys } from './queryKeys';

/** Дашборд обновляется сам: явка «в реальном времени» (до WebSocket'ов — опрос раз в 10 секунд). */
const LIVE_REFETCH_MS = 10_000;

export function useEventStats(eventId: string) {
  return useQuery({
    queryKey: queryKeys.stats(eventId),
    queryFn: () => api.organizer.getStats(eventId),
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useAttendees(eventId: string, query: AttendeesQuery) {
  return useQuery({
    queryKey: queryKeys.attendees(eventId, query),
    queryFn: () => api.organizer.listAttendees(eventId, query),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFETCH_MS,
  });
}

export function useExportAttendees() {
  return useMutation({ mutationFn: (eventId: string) => api.organizer.exportAttendees(eventId) });
}

export function useVolunteers(eventId: string) {
  return useQuery({
    queryKey: queryKeys.volunteers(eventId),
    queryFn: () => api.organizer.listVolunteers(eventId),
  });
}

export function useGrantVolunteer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (identifier: string) => api.organizer.grantVolunteer(eventId, { identifier }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(eventId) }),
  });
}

export function useRevokeVolunteer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.organizer.revokeVolunteer(eventId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.volunteers(eventId) }),
  });
}
