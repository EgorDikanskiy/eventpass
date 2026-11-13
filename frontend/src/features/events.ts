import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type EventInput, type MyEventsTab } from '@/api';
import { queryKeys } from './queryKeys';

export function usePublicEvent(slug: string) {
  return useQuery({
    queryKey: queryKeys.publicEvent(slug),
    queryFn: () => api.events.getPublic(slug),
  });
}

export function useEventById(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: () => api.events.getById(id!),
    enabled: !!id,
  });
}

export function useMyEvents(tab: MyEventsTab, enabled = true) {
  return useQuery({
    queryKey: queryKeys.myEvents(tab),
    queryFn: () => api.events.listMine(tab),
    enabled,
    refetchOnWindowFocus: true,
  });
}

export function useSaveEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, publish }: { id?: string; input: EventInput; publish: boolean }) => {
      if (!id) return api.events.create(input, publish);
      return api.events.update(id, input).then((event) =>
        publish && event.status === 'draft' ? api.events.publish(event.id) : event,
      );
    },
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myEventsAll });
      queryClient.setQueryData(queryKeys.event(event.id), event);
      queryClient.invalidateQueries({ queryKey: queryKeys.publicEvent(event.slug) });
    },
  });
}
