import { BadgeCheck, CalendarDays, MapPin, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { isApiError, type EventDetails } from '@/api';
import { usePublicEvent } from '@/features/events';
import { formatDateTime, plural } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Badge, ButtonLink, EmptyState, ErrorState, PageLoader } from '@/shared/ui';
import { RegistrationCard } from './RegistrationCard';
import styles from './EventPage.module.css';

function Availability({ event }: { event: EventDetails }) {
  const left = Math.max((event.capacity ?? 0) - event.registeredCount, 0);
  if (left === 0) return <span className={styles.metaWarn}>Мест нет</span>;
  const few = left <= Math.max(10, (event.capacity ?? 0) * 0.1);
  return (
    <span className={few ? styles.metaWarn : undefined}>
      Осталось {left} {plural(left, ['место', 'места', 'мест'])}
    </span>
  );
}

function StatusBadge({ event }: { event: EventDetails }) {
  if (event.status === 'finished') return <Badge tone="muted">Завершено</Badge>;
  if (event.status === 'live') return <Badge tone="success">Идёт сейчас</Badge>;
  if (event.registeredCount >= (event.capacity ?? 0)) return <Badge tone="warning">Мест нет</Badge>;
  return (
    <span className={styles.openBadge}>
      <span className={styles.openDot} />
      Открыта регистрация
    </span>
  );
}

function Cover({ event }: { event: EventDetails }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.cover}>
      {event.coverUrl && !failed ? (
        <img src={event.coverUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <div className={styles.coverPlaceholder} aria-hidden />
      )}
      <div className={styles.coverGradient} />
      {(event.coverCaption || event.coverBadge) && (
        <div className={styles.coverFooter}>
          {event.coverCaption && (
            <span className={styles.coverCaption}>
              <BadgeCheck size={14} />
              {event.coverCaption}
            </span>
          )}
          {event.coverBadge && <span className={styles.coverBadge}>{event.coverBadge}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Публичная страница мероприятия (по ссылке от организатора).
 * Макеты: «Гость / Страница мероприятия» и «Участник / Страница мероприятия (авторизован)».
 */
export function EventPage() {
  const { slug = '' } = useParams();
  const { data, error, isPending, refetch } = usePublicEvent(slug);
  useDocumentTitle(data?.event.title);

  if (isPending) return <PageLoader />;
  if (isApiError(error, 'NOT_FOUND')) {
    return (
      <div className={styles.container}>
        <EmptyState title="Мероприятие не найдено">
          Проверьте ссылку или спросите её у организатора — возможно, мероприятие ещё не опубликовано.
        </EmptyState>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.container}>
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const { event, viewer } = data;

  return (
    <div className={styles.page}>
      <div className={styles.glowLeft} aria-hidden />
      <div className={styles.glowRight} aria-hidden />
      <div className={styles.container}>
        <div className={styles.grid}>
          <section className={styles.info}>
            <div className={styles.badges}>
              <StatusBadge event={event} />
              <span className={styles.priceBadge}>{event.priceType === 'free' ? 'Бесплатно' : 'Платно'}</span>
            </div>

            <div className={styles.heading}>
              <h1>{event.title}</h1>
              <p>{event.description}</p>
            </div>

            <div className={styles.meta}>
              <div className={styles.metaItem}>
                <CalendarDays size={18} />
                <div>
                  <span>Дата и время</span>
                  <strong>{formatDateTime(event.startsAt)}</strong>
                </div>
              </div>
              <div className={styles.metaItem}>
                <MapPin size={18} />
                <div>
                  <span>Локация</span>
                  <strong>{event.location}</strong>
                </div>
              </div>
              <div className={styles.metaItem}>
                <UsersRound size={18} className={styles.metaIconWarn} />
                <div>
                  <span>Доступность</span>
                  <strong>
                    <Availability event={event} />
                  </strong>
                </div>
              </div>
            </div>

            <Cover event={event} />

            {event.sections.length > 0 && (
              <div className={styles.sections}>
                <h2>Программа секций</h2>
                <div className={styles.sectionList}>
                  {event.sections.map((section, index) => (
                    <div key={section.id} className={styles.section}>
                      <span className={styles.sectionIndex}>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{section.title}</strong>
                        <span>{section.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className={styles.aside}>
            {viewer.isOrganizer && <ButtonLink to={`/events/${event.id}/dashboard`} variant="secondary">Открыть дашборд</ButtonLink>}
            {viewer.isVolunteer && <ButtonLink to={`/events/${event.id}/scanner`} variant="secondary">Открыть сканер</ButtonLink>}
            <RegistrationCard event={event} viewer={viewer} />
          </aside>
        </div>
      </div>
    </div>
  );
}
