import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RegisterForEventRequest, type TicketsScope } from '@/api';
import { queryKeys } from './queryKeys';

export function useMyTickets(scope: TicketsScope) {
  return useQuery({
    queryKey: queryKeys.myTickets(scope),
    queryFn: () => api.tickets.listMine(scope),
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string, accessToken?: string) {
  return useQuery({
    queryKey: [...queryKeys.ticket(id), accessToken ?? null],
    queryFn: () => api.tickets.getById(id, accessToken),
  });
}

export function useRegisterForEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, body }: { eventId: string; body: RegisterForEventRequest }) =>
      api.registrations.register(eventId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useCancelTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => api.tickets.cancel(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketsAll });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
