import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, apiConfig, getErrorMessage } from '@/api';
import { useTicket } from '@/features/tickets';
import { formatDateTime } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Badge, Button, ButtonLink, ErrorState, PageLoader, useToast } from '@/shared/ui';
import { QrFullscreenDialog, TicketQr, TicketPdfButton } from '@/widgets/ticket';
import styles from './GuestTicketPage.module.css';

/** «Гость / Билет после регистрации без аккаунта». */
export function GuestTicketPage() {
  const { ticketId = '' } = useParams();
  const [params] = useSearchParams();
  const accessToken = params.get('token') ?? undefined;
  const accountCreated = params.get('created') === '1';
  const { data: ticket, error, isPending, refetch } = useTicket(ticketId, accessToken);
  const [fullscreen, setFullscreen] = useState(false);
  const [resending, setResending] = useState(false);
  const toast = useToast();
  useDocumentTitle('Ваш билет');

  if (isPending) return <PageLoader />;
  if (error || !ticket) {
    return (
      <div className={styles.page}>
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  async function resend() {
    setResending(true);
    try {
      await api.auth.resendVerification(ticket!.holderEmail);
      toast('Проверьте почту', 'success');
    } catch (e) {
      toast(getErrorMessage(e), 'danger');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.ticket}>
        <div className={styles.ticketHead}>
          {ticket.status === 'cancelled' ? <Badge tone="danger">Регистрация отменена</Badge> : (
            <Badge tone="success">{ticket.status === 'used' ? 'Билет использован' : 'Вы зарегистрированы'}</Badge>
          )}
          <span className={styles.code}>#{ticket.code}</span>
        </div>
        <h1 className={styles.title}>{ticket.event.title}</h1>
        <p className={styles.meta}>
          {formatDateTime(ticket.event.startsAt)} · {ticket.event.location}
        </p>
        <div className={styles.qr}>
          <TicketQr value={ticket.qrToken} size={160} onClick={() => setFullscreen(true)} />
        </div>
        <p className={styles.hint}>Покажите этот QR-код на входе. Можно сделать скриншот или скачать PDF</p>
        <TicketPdfButton ticket={ticket} accessToken={accessToken} fullWidth />
        <Button variant="secondary" fullWidth onClick={() => setFullscreen(true)}>
          Показать на весь экран
        </Button>
        <p className={styles.sent}>Билет отправлен на {ticket.holderEmail}</p>
      </section>

      {accountCreated && (
        <section className={styles.account}>
          <h2>Сохраните билет в личном кабинете</h2>
          <p>
            Мы создали аккаунт на {ticket.holderEmail}. Перейдите по ссылке из письма, чтобы подтвердить почту и задать
            пароль — билеты и история посещений будут в «Мои билеты».
          </p>
          <ButtonLink
            to={apiConfig.mode === 'http' ? '/login' : '/register'}
            state={{ email: ticket.holderEmail, fullName: ticket.holderName }}
            fullWidth
            icon={<UserRound size={16} />}
          >
            Перейти в личный кабинет
          </ButtonLink>
          <Button variant="secondary" fullWidth onClick={() => toast('Мобильное приложение появится в следующих версиях')}>
            Открыть в приложении
          </Button>
          <Button variant="link" onClick={resend} disabled={resending} className={styles.resend}>
            Письмо не пришло? Отправить ещё раз
          </Button>
        </section>
      )}

      <QrFullscreenDialog ticket={ticket} open={fullscreen} onClose={() => setFullscreen(false)} />
    </div>
  );
}
