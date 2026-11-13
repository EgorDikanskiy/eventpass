import { useParams } from 'react-router-dom';
import { isApiError } from '@/api';
import { useEventById } from '@/features/events';
import { copyText, eventPublicUrl } from '@/shared/lib/files';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Button, ButtonLink, ErrorState, Input, PageLoader, ResultMark, useToast } from '@/shared/ui';
import { ForbiddenRedirect } from './ForbiddenRedirect';
import styles from './PublishedPage.module.css';

/** «Организатор / Мероприятие опубликовано» — ссылка для участников. */
export function PublishedPage() {
  const { eventId = '' } = useParams();
  const { data: event, error, isPending, refetch } = useEventById(eventId);
  const toast = useToast();
  useDocumentTitle('Мероприятие опубликовано');

  if (isPending) return <PageLoader />;
  if (isApiError(error, 'FORBIDDEN') || isApiError(error, 'NOT_FOUND')) return <ForbiddenRedirect />;
  if (error || !event) return <ErrorState error={error} onRetry={() => refetch()} />;

  const url = eventPublicUrl(event.slug);

  return (
    <div className={styles.page}>
      <ResultMark tone="success" size={88} />
      <h1>Мероприятие опубликовано</h1>
      <p className={styles.lead}>
        Отправьте участникам ссылку на страницу регистрации. По ней откроется публичная страница мероприятия с вашей
        формой.
      </p>
      <div className={styles.card}>
        <span className={styles.label}>Ссылка для регистрации</span>
        <div className={styles.linkRow}>
          <Input readOnly value={url.replace(/^https?:\/\//, '')} aria-label="Ссылка для регистрации" onFocus={(e) => e.target.select()} />
          <Button
            variant="secondary"
            onClick={async () => toast((await copyText(url)) ? 'Ссылка скопирована' : url, 'success')}
          >
            Копировать
          </Button>
        </div>
        <div className={styles.actions}>
          <ButtonLink to={`/events/${event.id}/dashboard`}>Открыть дашборд</ButtonLink>
          <ButtonLink to={`/events/${event.id}/volunteers`} variant="secondary">
            Волонтёры
          </ButtonLink>
        </div>
        <p className={styles.hint}>
          Ссылка всегда доступна в «Мои мероприятия» → «Ссылка». <a href={url} target="_blank" rel="noreferrer">Открыть страницу</a>
        </p>
      </div>
    </div>
  );
}
