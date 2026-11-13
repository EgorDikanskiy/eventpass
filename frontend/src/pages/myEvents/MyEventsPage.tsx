import { CirclePlus, ScanLine } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage, type EventSummary, type MyEventsTab } from '@/api';
import { useMyEvents, useSaveEvent } from '@/features/events';
import { Page, PageHeader } from '@/layouts/Page';
import { copyText, eventPublicUrl } from '@/shared/lib/files';
import { formatDateTimeFull, formatRelativeDay, percent } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  PageLoader,
  Segmented,
  StatusDot,
  useToast,
} from '@/shared/ui';
import styles from './MyEventsPage.module.css';

const TABS: MyEventsTab[] = ['organizing', 'volunteering', 'drafts'];

const SUBTITLES: Record<MyEventsTab, string> = {
  organizing: 'События, которые вы создали как организатор',
  volunteering:
    'Мероприятия, на которых вам поручили проверять билеты',
  drafts: 'Неопубликованные мероприятия — их видите только вы',
};

function meta(event: EventSummary) {
  return [formatDateTimeFull(event.startsAt), event.location].join(' · ');
}

function OrganizingCard({ event }: { event: EventSummary }) {
  const toast = useToast();
  const live = event.status === 'live';
  const finished = event.status === 'finished';
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.cardMain}>
          <StatusDot tone={finished ? 'muted' : live ? 'success' : 'accent'}>
            {finished ? 'Завершено' : live ? 'Идёт сейчас' : 'Регистрация открыта'}
          </StatusDot>
          <h2 className={styles.cardTitle}>{event.title}</h2>
          <p className={styles.cardMeta}>{meta(event)}</p>
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>Зарегистрировано</dt>
            <dd>
              {event.registeredCount} / {event.capacity}
            </dd>
          </div>
          <div>
            <dt>Явка</dt>
            <dd>{live || finished ? `${event.checkedInCount} (${percent(event.checkedInCount, event.registeredCount)}%)` : '—'}</dd>
          </div>
        </dl>
      </div>
      <div className={styles.cardActions}>
        <div className={styles.buttons}>
          <ButtonLink to={`/events/${event.id}/dashboard`}>Дашборд</ButtonLink>
          <Button
            variant="secondary"
            onClick={async () => {
              const url = eventPublicUrl(event.slug);
              toast((await copyText(url)) ? 'Ссылка на регистрацию скопирована' : url, 'success');
            }}
          >
            Ссылка
          </Button>
          {!finished && <ButtonLink to={`/events/${event.id}/scanner`} variant="secondary">Сканер</ButtonLink>}
        </div>
        <Link to={`/events/${event.id}/edit`} className={styles.edit}>
          Редактировать
        </Link>
      </div>
    </article>
  );
}

function VolunteeringCard({ event }: { event: EventSummary }) {
  const relative = formatRelativeDay(event.startsAt);
  const today = relative === 'Сегодня' || event.status === 'live';
  return (
    <article className={styles.card}>
      <div className={styles.volunteerRow}>
        <div className={styles.cardMain}>
          <Badge tone={today ? 'success' : 'neutral'}>{relative}</Badge>
          <h2 className={styles.cardTitle}>{event.title}</h2>
          <p className={styles.cardMeta}>
            {meta(event)}
            {event.checkpoint && ` · ${event.checkpoint}`}
          </p>
        </div>
        <ButtonLink
          to={`/events/${event.id}/scanner`}
          variant={today ? 'primary' : 'secondary'}
          icon={<ScanLine size={18} />}
        >
          Открыть сканер
        </ButtonLink>
      </div>
    </article>
  );
}

function DraftCard({ event }: { event: EventSummary }) {
  const toast = useToast();
  const save = useSaveEvent();
  return (
    <article className={styles.card}>
      <div className={styles.volunteerRow}>
        <div className={styles.cardMain}>
          <Badge tone="muted">Черновик</Badge>
          <h2 className={styles.cardTitle}>{event.title}</h2>
          <p className={styles.cardMeta}>{meta(event)}</p>
        </div>
        <div className={styles.buttons}>
          <ButtonLink to={`/events/${event.id}/edit`} variant="secondary">
            Редактировать
          </ButtonLink>
          <Button
            loading={save.isPending}
            onClick={async () => {
              try {
                const details = await api.events.getById(event.id);
                await save.mutateAsync({
                  id: event.id,
                  publish: true,
                  input: {
                    title: details.title,
                    description: details.description,
                    startsAt: details.startsAt,
                    location: details.location,
                    capacity: details.capacity,
                    priceType: details.priceType,
                    questions: details.questions,
                  },
                });
                toast('Мероприятие опубликовано', 'success');
              } catch (error) {
                toast(getErrorMessage(error), 'danger');
              }
            }}
          >
            Опубликовать
          </Button>
        </div>
      </div>
    </article>
  );
}

/** «Мои мероприятия» с вкладками «Организую» / «Волонтёр» / «Черновики». */
export function MyEventsPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as MyEventsTab | null;
  const tab: MyEventsTab = tabParam && TABS.includes(tabParam) ? tabParam : 'organizing';
  const { data, error, isPending, refetch } = useMyEvents(tab);
  useDocumentTitle('Мои мероприятия');

  const counters = data?.counters;
  const items = data?.items ?? [];
  const roles = data?.roles ?? [];
  const tabs: { value: MyEventsTab; label: string; count?: number }[] = [];
  if (roles.includes('organizer')) {
    tabs.push({ value: 'organizing', label: 'Организую', count: counters?.organizing });
  }
  if (roles.includes('volunteer')) {
    tabs.push({ value: 'volunteering', label: 'Волонтёр', count: counters?.volunteering });
  }
  if (roles.includes('organizer')) {
    tabs.push({ value: 'drafts', label: 'Черновики', count: counters?.drafts });
  }

  if (tabs.length && !tabs.some((item) => item.value === tab)) {
    const firstTab = tabs[0].value;
    return <Navigate to={firstTab === 'organizing' ? '/events' : `/events?tab=${firstTab}`} replace />;
  }

  return (
    <Page>
      <PageHeader
        title="Мои мероприятия"
        subtitle={tabs.length ? SUBTITLES[tab] : undefined}
        actions={
          <ButtonLink to="/events/new" icon={<CirclePlus size={18} />}>
            Создать событие
          </ButtonLink>
        }
      />

      {tabs.length > 0 && (
        <Segmented
          className={styles.tabs}
          ariaLabel="Мои мероприятия"
          countStyle="dot"
          value={tab}
          onChange={(next) => setParams(next === 'organizing' ? {} : { tab: next })}
          items={tabs}
        />
      )}

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className={styles.list}>
          {!tabs.length && (
            <EmptyState title="У вас пока нет мероприятий">
              Создайте своё событие или передайте организатору email или ID из профиля для доступа к сканеру.
            </EmptyState>
          )}
          {tabs.length > 0 && items.length === 0 && tab === 'organizing' && (
            <EmptyState
              title="Вы ещё не создали мероприятий"
              action={
                <ButtonLink to="/events/new" size="sm">
                  Создать событие
                </ButtonLink>
              }
            >
              Создайте событие, настройте анкету и отправьте участникам ссылку на регистрацию.
            </EmptyState>
          )}
          {tabs.length > 0 && items.length === 0 && tab === 'drafts' && <EmptyState title="Черновиков нет" />}

          {tab === 'organizing' && items.map((event) => <OrganizingCard key={event.id} event={event} />)}
          {tab === 'volunteering' && items.map((event) => <VolunteeringCard key={event.id} event={event} />)}
          {tab === 'drafts' && items.map((event) => <DraftCard key={event.id} event={event} />)}

          {tabs.length > 0 && tab === 'volunteering' && (
            <EmptyState title="Нет нужного мероприятия?">
              Организатор выдаёт права по вашему email или ID из профиля. После этого мероприятие появится на этой
              вкладке, а у него — кнопка «Открыть сканер».
            </EmptyState>
          )}
        </div>
      )}
    </Page>
  );
}
