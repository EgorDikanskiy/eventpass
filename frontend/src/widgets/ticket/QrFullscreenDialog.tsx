import type { Ticket } from '@/api';
import { formatDateTime } from '@/shared/lib/format';
import { Dialog } from '@/shared/ui';
import { TicketQr } from './TicketQr';
import styles from './QrFullscreenDialog.module.css';

/** «Показать QR на весь экран» — для прохода на входе. */
export function QrFullscreenDialog({ ticket, open, onClose }: { ticket: Ticket; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullscreen>
      <div className={styles.root}>
        <p className={styles.title}>{ticket.event.title}</p>
        <p className={styles.meta}>
          {formatDateTime(ticket.event.startsAt)} · {ticket.zone}
        </p>
        <TicketQr value={ticket.qrToken} size={Math.min(320, window.innerWidth - 96)} />
        <p className={styles.code}>#{ticket.code}</p>
        <p className={styles.holder}>{ticket.holderName}</p>
        <p className={styles.hint}>Увеличьте яркость экрана и покажите код волонтёру на входе</p>
      </div>
    </Dialog>
  );
}
