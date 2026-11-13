import clsx from 'clsx';
import { Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import styles from './TicketQr.module.css';

interface TicketQrProps {
  /** Токен билета — именно он зашит в QR, без персональных данных. */
  value: string;
  size?: number;
  /** Билет использован/отменён — QR приглушён. */
  inactive?: boolean;
  onClick?: () => void;
}

/** QR-код билета на белой подложке с отметкой в центре (как в макете). */
export function TicketQr({ value, size = 168, inactive, onClick }: TicketQrProps) {
  const content = (
    <>
      <QRCodeSVG value={value} size={size} level="H" bgColor="#ffffff" fgColor="#0f131c" marginSize={0} />
      <span className={styles.mark} aria-hidden>
        <Check size={Math.round(size * 0.1)} strokeWidth={3} />
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={clsx(styles.qr, styles.clickable, inactive && styles.inactive)}
        style={{ padding: size * 0.12 }}
        onClick={onClick}
        aria-label="Развернуть QR-код на весь экран"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={clsx(styles.qr, inactive && styles.inactive)} style={{ padding: size * 0.12 }}>
      {content}
    </div>
  );
}
