import { useQuery } from '@tanstack/react-query';
import { useMatch } from 'react-router-dom';
import { api, apiConfig, type EventViewerContext } from '@/api';
import { useAuth } from '@/app/AuthProvider';
import { queryKeys } from '@/features/queryKeys';
import styles from './DevRoleBadge.module.css';

/**
 * Плашка «кто я сейчас» для разработки и тестирования. В продакшен-сборке с
 * настоящим бэкендом не показывается (см. SHOW_DEV_BADGE).
 *
 * Роль в EventPass — не тип аккаунта, а отношение к конкретному мероприятию,
 * поэтому плашка показывает:
 *  - на странице мероприятия — роль на ЭТОМ мероприятии;
 *  - в личном кабинете — сводку: в скольких мероприятиях вы участник / волонтёр / организатор.
 */
const SHOW_DEV_BADGE = import.meta.env.DEV || apiConfig.mode === 'mock';

function rolesFromViewer(viewer: EventViewerContext): string[] {
  const roles: string[] = [];
  if (viewer.isOrganizer) roles.push('Организатор');
  if (viewer.isVolunteer) roles.push('Волонтёр');
  if (viewer.ticketId) roles.push('Участник');
  return roles;
}

function Badge({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <span className={styles.badge} title={title}>
      <span className={styles.dev}>DEV</span>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
    </span>
  );
}

/** Роль на публичной странице мероприятия /e/:slug. */
function PublicEventRole({ slug }: { slug: string }) {
  const { data } = useQuery({ queryKey: queryKeys.publicEvent(slug), queryFn: () => api.events.getPublic(slug) });
  if (!data) return <Badge label="Роль здесь:" value="…" title="Загружаем роль на мероприятии" />;
  const roles = rolesFromViewer(data.viewer);
  return (
    <Badge
      label="Роль здесь:"
      value={roles.length ? roles.join(' + ') : 'Без роли (может зарегистрироваться)'}
      title={`Ваша роль на мероприятии «${data.event.title}»`}
    />
  );
}

/** Роль на внутренних экранах мероприятия /events/:id/… (дашборд, сканер, волонтёры). */
function ManagedEventRole({ eventId, isScanner }: { eventId: string; isScanner: boolean }) {
  const asOrganizer = useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => api.events.getById(eventId),
    retry: false,
  });
  const asScanner = useQuery({
    queryKey: queryKeys.scanner(eventId),
    queryFn: () => api.scanner.getInfo(eventId),
    enabled: isScanner && asOrganizer.isError,
    retry: false,
  });

  let value = '…';
  if (asOrganizer.isSuccess) value = 'Организатор';
  else if (asOrganizer.isError && !isScanner) value = 'Нет прав';
  else if (asScanner.isSuccess) value = 'Волонтёр';
  else if (asScanner.isError) value = 'Нет прав';

  const title = asOrganizer.data ? `Ваша роль на мероприятии «${asOrganizer.data.title}»` : 'Ваша роль на этом мероприятии';
  return <Badge label="Роль здесь:" value={value} title={title} />;
}

/** Сводка ролей в личном кабинете. */
function CabinetSummary() {
  const tickets = useQuery({ queryKey: queryKeys.myTickets('upcoming'), queryFn: () => api.tickets.listMine('upcoming') });
  const events = useQuery({ queryKey: queryKeys.myEvents('organizing'), queryFn: () => api.events.listMine('organizing') });
  const participant = tickets.data?.counters.upcoming;
  const counters = events.data?.counters;
  const parts = [
    `участник: ${participant ?? '…'}`,
    `волонтёр: ${counters?.volunteering ?? '…'}`,
    `организатор: ${counters ? counters.organizing + counters.drafts : '…'}`,
  ];
  return (
    <Badge
      label="Роли по мероприятиям —"
      value={parts.join(' · ')}
      title="Роль зависит от мероприятия: число — в скольких активных мероприятиях у вас эта роль"
    />
  );
}

export function DevRoleBadge() {
  const { status } = useAuth();
  const publicEvent = useMatch('/e/:slug/*');
  const managedEvent = useMatch('/events/:eventId/*');
  const scanner = useMatch('/events/:eventId/scanner');

  if (!SHOW_DEV_BADGE || status === 'loading') return null;
  if (status === 'guest') return <Badge label="Роль:" value="Гость (не авторизован)" title="Вы не вошли в аккаунт" />;

  if (publicEvent?.params.slug) return <PublicEventRole slug={publicEvent.params.slug} />;
  const eventId = managedEvent?.params.eventId;
  if (eventId && eventId !== 'new') return <ManagedEventRole eventId={eventId} isScanner={!!scanner} />;
  return <CabinetSummary />;
}
