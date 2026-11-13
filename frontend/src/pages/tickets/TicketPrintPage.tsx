import { QRCodeSVG } from 'qrcode.react';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTicket } from '@/features/tickets';
import { formatDateTimeFull } from '@/shared/lib/format';
import { ErrorState, PageLoader } from '@/shared/ui';
import styles from './TicketPrintPage.module.css';

/**
 * Печатная версия билета → «Сохранить как PDF» в диалоге печати.
 * Временная замена серверному PDF (см. widgets/ticket/pdf.ts).
 */
export function TicketPrintPage() {
  const { ticketId = '' } = useParams();
  const [params] = useSearchParams();
  const { data: ticket, error, isPending } = useTicket(ticketId, params.get('token') ?? undefined);

  useEffect(() => {
    if (!ticket) return;
    document.title = `Билет ${ticket.code}`;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [ticket]);

  if (isPending) return <PageLoader />;
  if (error || !ticket) return <ErrorState error={error} />;

  return (
    <div className={styles.sheet}>
      <div className={styles.brand}>EventPass · электронный билет</div>
      <h1>{ticket.event.title}</h1>
      <p className={styles.meta}>
        {formatDateTimeFull(ticket.event.startsAt)} · {ticket.event.location}
      </p>
      <div className={styles.body}>
        <QRCodeSVG value={ticket.qrToken} size={220} level="H" marginSize={2} />
        <dl>
          <dt>Участник</dt>
          <dd>{ticket.holderName}</dd>
          <dt>Категория</dt>
          <dd>{ticket.category}</dd>
          <dt>Зона прохода</dt>
          <dd>{ticket.zone}</dd>
          <dt>Номер билета</dt>
          <dd>#{ticket.code}</dd>
        </dl>
      </div>
      <p className={styles.note}>Покажите QR-код на входе. Билет действителен для одного прохода.</p>
      <button type="button" className={styles.printButton} onClick={() => window.print()}>
        Сохранить в PDF / распечатать
      </button>
    </div>
  );
}
