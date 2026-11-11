import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { queryKeys } from '@/features/queryKeys';
import { useToast } from '@/shared/ui';

/** Нет прав на мероприятие (чужой дашборд, отозванные права волонтёра) → «Мои мероприятия». */
export function ForbiddenRedirect({
  message = 'Нет доступа к этому мероприятию',
  to = '/events',
}: {
  message?: string;
  to?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  useEffect(() => {
    toast(message, 'danger');
    void queryClient.invalidateQueries({ queryKey: queryKeys.myEventsAll });
  }, [toast, message, queryClient]);
  return <Navigate to={to} replace />;
}
