import {
  CalendarDays,
  ChevronRight,
  Clock,
  Lightbulb,
  MapPin,
  Maximize,
  QrCode,
  Smartphone,
  SquareTerminal,
  TicketIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiConfig, getErrorMessage, type Ticket, type TicketsScope } from '@/api';
import { Page } from '@/layouts/Page';
import { useCancelTicket, useMyTickets } from '@/features/tickets';
import { formatDateTime, formatDateTimeFull } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import {
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageLoader,
  Segmented,
  StatusDot,
  useToast,
} from '@/shared/ui';
import { QrFullscreenDialog, TicketQr, TicketPdfButton } from '@/widgets/ticket';
import styles from './MyTicketsPage.module.css';

function MainTicket({ ticket }: { ticket: Ticket }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useCancelTicket();
  const toast = useToast();

  async function handleCancel() {
    try {
      await cancel.mutateAsync(ticket.id);
      toast('Регистрация отменена, место освобождено', 'success');
      setConfirmCancel(false);
    } catch (error) {
      toast(getErrorMessage(error), 'danger');
    }
  }

  return (
    <article className={styles.main}>
      <div className={styles.qrSide}>
        <div className={styles.qrHead}>
          <Badge>#{ticket.code}</Badge>
          <StatusDot tone="success">
            <span className={styles.activeText}>{ticket.status === 'used' ? 'Использован' : 'Активен'}</span>
          </StatusDot>
        </div>
        <TicketQr value={ticket.qrToken} size={170} onClick={() => setFullscreen(true)} />
        <p className={styles.qrHint}>Нажмите, чтобы развернуть код на весь экран</p>
      </div>

      <div className={styles.divider} aria-hidden />

      <div className={styles.infoSide}>
        <div className={styles.categoryRow}>
          <Badge tone="accent">{ticket.event.category}</Badge>
        </div>
        <h2 className={styles.eventTitle}>
          <Link to={`/e/${ticket.event.slug}`}>{ticket.event.title}</Link>
        </h2>
        <div className={styles.eventMeta}>
          <span>
            <CalendarDays size={16} />
            {formatDateTimeFull(ticket.event.startsAt)}
          </span>
          <span>
            <MapPin size={16} />
            {ticket.event.location}
          </span>
        </div>

        <dl className={styles.details}>
          <div>
            <dt>Участник</dt>
            <dd>{ticket.holderName}</dd>
          </div>
          <div>
            <dt>Категория</dt>
            <dd className={styles.accentValue}>{ticket.category}</dd>
          </div>
          <div>
            <dt>Зона прохода</dt>
            <dd>{ticket.zone}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <Button icon={<Maximize size={16} />} onClick={() => setFullscreen(true)}>
            Показать QR на весь экран
          </Button>
          <TicketPdfButton ticket={ticket} />
          <Button
            variant="secondary"
            icon={<Smartphone size={16} />}
            onClick={() => toast('Мобильное приложение появится в следующих версиях')}
          >
            Открыть в приложении
          </Button>
        </div>
        {ticket.status === 'active' && (
          <Button variant="link" className={styles.cancelLink} onClick={() => setConfirmCancel(true)}>
            Отменить регистрацию
          </Button>
        )}
      </div>

      <QrFullscreenDialog ticket={ticket} open={fullscreen} onClose={() => setFullscreen(false)} />
      <ConfirmDialog
        open={confirmCancel}
        title="Отменить регистрацию?"
        confirmLabel="Отменить регистрацию"
        danger
        loading={cancel.isPending}
        onConfirm={handleCancel}
        onClose={() => setConfirmCancel(false)}
      >
        Билет #{ticket.code} на «{ticket.event.title}» станет недействительным, а место освободится для других
        участников.
      </ConfirmDialog>
    </article>
  );
}

function UpcomingList({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) {
  return (
    <div className={styles.list}>
      {tickets.map((ticket) => (
        <article key={ticket.id} className={styles.row}>
          <span className={styles.rowIcon}>
            <SquareTerminal size={20} />
          </span>
          <div className={styles.rowBody}>
            <div className={styles.rowBadges}>
              <Badge>#{ticket.code}</Badge>
              <span className={styles.confirmed}>Подтвержден</span>
            </div>
            <h3>{ticket.event.title}</h3>
            <p>
              {formatDateTimeFull(ticket.event.startsAt)} · {ticket.event.location}
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={<QrCode size={16} />} onClick={() => onOpen(ticket.id)}>
            Открыть билет и QR
          </Button>
        </article>
      ))}
    </div>
  );
}

const PAST_STATUS = {
  used: { tone: 'success', label: 'Посещено' },
  active: { tone: 'muted', label: 'Не пришёл' },
  cancelled: { tone: 'danger', label: 'Отменён' },
} as const;

function PastList({ tickets }: { tickets: Ticket[] }) {
  if (!tickets.length) {
    return <EmptyState title="Здесь пока пусто">После мероприятий здесь появится история посещений.</EmptyState>;
  }
  return (
    <div className={styles.list}>
      {tickets.map((ticket) => {
        const status = PAST_STATUS[ticket.status];
        return (
          <article key={ticket.id} className={styles.row}>
            <div className={styles.rowBody}>
              <h3>{ticket.event.title}</h3>
              <p>
                {formatDateTime(ticket.event.startsAt)} · {ticket.event.location}
              </p>
            </div>
            <StatusDot tone={status.tone}>{status.label}</StatusDot>
          </article>
        );
      })}
    </div>
  );
}

/**
 * «Участник / Мои билеты (билет с QR)» — домашний экран авторизованного пользователя.
 * Главный билет открыт сразу, QR на экране; остальные — списком ниже.
 */
export function MyTicketsPage() {
  const [params, setParams] = useSearchParams();
  const scope: TicketsScope = params.get('tab') === 'past' ? 'past' : 'upcoming';
  const selectedId = params.get('ticket');
  const { data, error, isPending, refetch, dataUpdatedAt } = useMyTickets(scope);
  useDocumentTitle('Мои билеты');

  function setScope(next: TicketsScope) {
    setParams(next === 'past' ? { tab: 'past' } : {});
  }

  function openTicket(id: string) {
    setParams({ ticket: id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const items = data?.items ?? [];
  const main = scope === 'upcoming' ? (items.find((t) => t.id === selectedId) ?? items[0]) : undefined;
  const others = items.filter((t) => t !== main);
  const updatedAgo = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 60_000) : 0;

  return (
    <Page width="default">
      <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
        <span>Личный кабинет</span>
        <ChevronRight size={14} />
        <span className={styles.breadcrumbActive}>Электронные пропуска</span>
      </nav>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Мои билеты</h1>
          <p className={styles.subtitle}>Ваши электронные пропуска и история посещений</p>
        </div>
        <Segmented
          ariaLabel="Билеты"
          value={scope}
          onChange={setScope}
          items={[
            { value: 'upcoming', label: 'Предстоящие', count: data?.counters.upcoming },
            { value: 'past', label: 'Прошедшие', count: data?.counters.past },
          ]}
        />
      </div>

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : scope === 'past' ? (
        <PastList tickets={items} />
      ) : !main ? (
        <EmptyState
          title="У вас пока нет билетов"
          action={
            apiConfig.mode === 'mock' && (
              <ButtonLink to="/e/devfest-2026" size="sm" variant="secondary">
                Демо: открыть страницу мероприятия
              </ButtonLink>
            )
          }
        >
          Зарегистрируйтесь на мероприятие по ссылке от организатора — билет с QR появится здесь.
        </EmptyState>
      ) : (
        <>
          <div className={styles.sectionHead}>
            <h2>
              <TicketIcon size={18} />
              {main.id === items[0]?.id ? 'Главный активный пропуск' : 'Выбранный пропуск'}
            </h2>
            <span>{updatedAgo < 1 ? 'Обновлено только что' : `Обновлено ${updatedAgo} мин назад`}</span>
          </div>
          <MainTicket key={main.id} ticket={main} />

          {others.length > 0 && (
            <>
              <div className={styles.sectionHead}>
                <h2>
                  <Clock size={18} />
                  {others.length === 1 ? 'Следующее событие' : 'Другие билеты'}
                </h2>
              </div>
              <UpcomingList tickets={others} onOpen={openTicket} />
            </>
          )}

          <aside className={styles.tip}>
            <Lightbulb size={20} />
            <div>
              <h3>Рекомендация для быстрого прохода</h3>
              <p>
                Для быстрого прохода на входе увеличьте яркость экрана смартфона и покажите QR-код контролеру или
                приложите распечатанный PDF-билет.
              </p>
            </div>
          </aside>
        </>
      )}
    </Page>
  );
}
