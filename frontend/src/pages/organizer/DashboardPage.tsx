import { CalendarDays, CircleCheck, Clock3, Download, MapPin, ScanLine, Search, UserCheck, UserPlus } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getErrorMessage, isApiError, type AttendeeStatus } from '@/api';
import { useEventById } from '@/features/events';
import { useAttendees, useEventStats, useExportAttendees } from '@/features/organizer';
import { BackLink } from '@/layouts/Page';
import { downloadBlob } from '@/shared/lib/files';
import { formatDate, formatTimeWithSeconds, percent } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Input,
  MetricCard,
  PageLoader,
  Spinner,
  StatusDot,
  useToast,
} from '@/shared/ui';
import { ForbiddenRedirect } from './ForbiddenRedirect';
import styles from './DashboardPage.module.css';

const PAGE_SIZE = 10;

const STATUS: Record<AttendeeStatus, { tone: 'success' | 'muted' | 'danger'; label: string }> = {
  present: { tone: 'success', label: 'Присутствует' },
  expected: { tone: 'muted', label: 'Ожидается' },
  cancelled: { tone: 'danger', label: 'Отменён' },
};

const EVENT_STATUS = {
  live: { tone: 'success', label: 'Активно' },
  published: { tone: 'accent', label: 'Регистрация открыта' },
  finished: { tone: 'muted', label: 'Завершено' },
  draft: { tone: 'muted', label: 'Черновик' },
} as const;

function AttendeesTable({ eventId }: { eventId: string }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const { data, error, isPending, isFetching, refetch } = useAttendees(eventId, {
    search: deferredSearch,
    page,
    pageSize: PAGE_SIZE,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Card className={styles.tableCard}>
      <div className={styles.tableHead}>
        <h2>
          Участники и чекины
          {data && <Badge>{data.total} всего</Badge>}
          {isFetching && !isPending && <Spinner size={14} />}
        </h2>
        <Input
          className={styles.search}
          leading={<Search size={16} />}
          placeholder="Поиск по имени или билету..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Поиск участников"
        />
      </div>

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Время чекина</th>
                  <th className={styles.right}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((attendee) => (
                  <tr key={attendee.ticketId}>
                    <td>
                      <span className={styles.person}>
                        <Avatar name={attendee.fullName} size={28} />
                        {attendee.fullName}
                      </span>
                    </td>
                    <td className={styles.muted}>{attendee.email}</td>
                    <td>{attendee.checkedInAt ? formatTimeWithSeconds(attendee.checkedInAt) : '—'}</td>
                    <td className={styles.right}>
                      <StatusDot tone={STATUS[attendee.status].tone}>{STATUS[attendee.status].label}</StatusDot>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      {deferredSearch ? 'Никого не нашли — проверьте запрос' : 'Пока никто не зарегистрировался'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.tableFooter}>
            <span>Синхронизировано в реальном времени с точками валидации</span>
            {pages > 1 && (
              <div className={styles.pager}>
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Назад
                </Button>
                <span>
                  {page} / {pages}
                </span>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Вперёд
                </Button>
              </div>
            )}
            <span className={styles.gateway}>
              <span className={styles.gatewayDot} />
              Шлюз активен
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/** «Организатор / Дашборд и явка». Цифры обновляются автоматически. */
export function DashboardPage() {
  const { eventId = '' } = useParams();
  const event = useEventById(eventId);
  const stats = useEventStats(eventId);
  const exportFile = useExportAttendees();
  const toast = useToast();
  useDocumentTitle(event.data ? `Дашборд · ${event.data.title}` : 'Дашборд');

  if (event.isPending) return <PageLoader />;
  if (isApiError(event.error, 'FORBIDDEN') || isApiError(event.error, 'NOT_FOUND')) return <ForbiddenRedirect />;
  if (event.error || !event.data) return <ErrorState error={event.error} onRetry={() => event.refetch()} />;

  const details = event.data;
  const s = stats.data;
  const status = EVENT_STATUS[details.status];

  async function handleExport() {
    try {
      const blob = await exportFile.mutateAsync(eventId);
      downloadBlob(blob, `участники-${details.slug}.csv`);
    } catch (error) {
      toast(getErrorMessage(error), 'danger');
    }
  }

  return (
    <div className={styles.page}>
      <BackLink to="/events">Мои мероприятия</BackLink>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.meta}>
            <span>
              <CalendarDays size={15} />
              {formatDate(details.startsAt)}
            </span>
            <span className={styles.sep}>•</span>
            <span>
              <MapPin size={15} />
              {details.location}
            </span>
            <span className={styles.sep}>•</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <h1>{details.title}</h1>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" icon={<Download size={16} />} loading={exportFile.isPending} onClick={handleExport}>
            Экспорт в Excel
          </Button>
          {details.status !== 'finished' && (
            <ButtonLink to={`/events/${eventId}/scanner`} variant="secondary" icon={<ScanLine size={16} />}>
              Сканер
            </ButtonLink>
          )}
          <ButtonLink to={`/events/${eventId}/volunteers`} icon={<UserPlus size={16} />}>
            {details.status === 'finished' ? 'Волонтёры' : 'Добавить волонтёра'}
          </ButtonLink>
        </div>
      </header>

      <div className={styles.metrics}>
        <MetricCard
          label="Зарегистрировано"
          icon={<UserCheck size={18} />}
          value={s?.registered ?? '—'}
          suffix={s && `/ ${s.capacity} мест`}
          progress={s ? percent(s.registered, s.capacity) : 0}
          barTone="light"
        />
        <MetricCard
          label="Пришли (явка)"
          icon={<CircleCheck size={18} />}
          value={s?.checkedIn ?? '—'}
          suffix={s && <span className={styles.accent}>({percent(s.checkedIn, s.registered)}%)</span>}
          progress={s ? percent(s.checkedIn, s.registered) : 0}
        />
        <MetricCard
          label="Не пришли"
          icon={<Clock3 size={18} />}
          value={s?.notCheckedIn ?? '—'}
          suffix={s && `человек (${percent(s.notCheckedIn, s.registered)}%)`}
          progress={s ? percent(s.notCheckedIn, s.registered) : 0}
          barTone="muted"
        />
      </div>

      <AttendeesTable eventId={eventId} />
    </div>
  );
}
