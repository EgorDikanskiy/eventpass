import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { isApiError } from '@/api';
import { useEventById } from '@/features/events';
import { ForbiddenRedirect } from '@/pages/organizer/ForbiddenRedirect';
import { ErrorState, PageLoader } from '@/shared/ui';
import { useAuth } from './AuthProvider';

/** Закрытые экраны: гостя отправляем на «Вход» и возвращаем обратно после входа. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader />;
  if (status === 'guest') {
    const returnUrl = location.pathname + location.search;
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} replace />;
  }
  return <Outlet />;
}

export function HomeRedirect() {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return <Navigate to={status === 'authenticated' ? '/tickets' : '/login'} replace />;
}

export function RequireOrganizer({ publishedOnly = false }: { publishedOnly?: boolean }) {
  const { eventId } = useParams();
  const { data: event, error, isPending, refetch } = useEventById(eventId);
  if (isPending) return <PageLoader />;
  if (isApiError(error, 'FORBIDDEN') || isApiError(error, 'NOT_FOUND')) return <ForbiddenRedirect />;
  if (error || !event) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (publishedOnly && event.status === 'draft') {
    return <ForbiddenRedirect message="Раздел доступен после публикации мероприятия" to="/events?tab=drafts" />;
  }
  return <Outlet />;
}
