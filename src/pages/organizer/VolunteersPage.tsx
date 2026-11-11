import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { getErrorMessage, isApiError, type Volunteer } from '@/api';
import { useEventById } from '@/features/events';
import { useGrantVolunteer, useRevokeVolunteer, useVolunteers } from '@/features/organizer';
import { BackLink, Page, PageHeader } from '@/layouts/Page';
import { formatDateTime } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Notice,
  PageLoader,
  useToast,
} from '@/shared/ui';
import { ForbiddenRedirect } from './ForbiddenRedirect';
import styles from './VolunteersPage.module.css';

function GrantForm({ eventId }: { eventId: string }) {
  const grant = useGrantVolunteer(eventId);
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError('Введите email или ID пользователя');
      return;
    }
    try {
      const volunteer = await grant.mutateAsync(identifier);
      toast(`${volunteer.fullName} теперь волонтёр`, 'success');
      setIdentifier('');
    } catch (err) {
      setError(isApiError(err) && err.fields?.identifier ? err.fields.identifier : getErrorMessage(err));
    }
  }

  return (
    <Card className={styles.card}>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <h2 className={styles.cardTitle}>Выдать права на сканирование</h2>
        <div className={styles.grantRow}>
          <Field label="Email или ID пользователя" error={error ?? undefined} className={styles.grantField}>
            {(id, describedBy) => (
              <Input
                id={id}
                placeholder="volunteer@example.com или 517204"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                aria-describedby={describedBy}
                invalid={!!error}
              />
            )}
          </Field>
          <Button type="submit" icon={<UserPlus size={16} />} loading={grant.isPending} className={styles.grantButton}>
            Выдать права
          </Button>
        </div>
        <Notice icon={<ShieldCheck size={16} />}>
          Волонтёр увидит мероприятие во вкладке «Волонтёр» и сможет только сканировать билеты. Участники, экспорт и
          настройки ему недоступны. ID пользователь найдёт у себя в профиле.
        </Notice>
      </form>
    </Card>
  );
}

function VolunteerRow({ eventId, volunteer }: { eventId: string; volunteer: Volunteer }) {
  const revoke = useRevokeVolunteer(eventId);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  return (
    <li className={styles.row}>
      <Avatar name={volunteer.fullName} size={36} />
      <div className={styles.rowBody}>
        <strong>{volunteer.fullName}</strong>
        <span>
          {volunteer.email} · #{volunteer.publicId}
        </span>
      </div>
      <span className={styles.granted}>с {formatDateTime(volunteer.grantedAt)}</span>
      <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
        Отозвать
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Отозвать права?"
        confirmLabel="Отозвать"
        danger
        loading={revoke.isPending}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await revoke.mutateAsync(volunteer.userId);
            toast('Права отозваны', 'success');
            setConfirm(false);
          } catch (error) {
            toast(getErrorMessage(error), 'danger');
          }
        }}
      >
        {volunteer.fullName} больше не сможет сканировать билеты. Если сканер у него открыт, следующая проверка вернёт
        отказ.
      </ConfirmDialog>
    </li>
  );
}

/** «Организатор / Волонтёры мероприятия»: выдача прав по email или ID и отзыв. */
export function VolunteersPage() {
  const { eventId = '' } = useParams();
  const event = useEventById(eventId);
  const volunteers = useVolunteers(eventId);
  useDocumentTitle('Волонтёры');

  if (event.isPending) return <PageLoader />;
  if (isApiError(event.error, 'FORBIDDEN') || isApiError(event.error, 'NOT_FOUND')) return <ForbiddenRedirect />;
  if (event.error || !event.data) return <ErrorState error={event.error} onRetry={() => event.refetch()} />;

  return (
    <Page>
      <BackLink to={`/events/${eventId}/dashboard`}>Дашборд</BackLink>
      <PageHeader title="Волонтёры мероприятия" subtitle={event.data.title} />
      <div className={styles.stack}>
        {event.data.status !== 'finished' && <GrantForm eventId={eventId} />}

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>
            Волонтёры {volunteers.data && <span className={styles.count}>{volunteers.data.length}</span>}
          </h2>
          {volunteers.isPending ? (
            <PageLoader />
          ) : volunteers.error ? (
            <ErrorState error={volunteers.error} onRetry={() => volunteers.refetch()} />
          ) : volunteers.data.length === 0 ? (
            <EmptyState title="Волонтёров пока нет">
              Выдайте права по email или ID — и человек сможет проверять билеты на входе. Организатор может сканировать
              и сам.
            </EmptyState>
          ) : (
            <ul className={styles.list}>
              {volunteers.data.map((volunteer) => (
                <VolunteerRow key={volunteer.userId} eventId={eventId} volunteer={volunteer} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}
