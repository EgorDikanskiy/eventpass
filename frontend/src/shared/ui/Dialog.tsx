import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Полноэкранный режим — для «Показать QR на весь экран». */
  fullscreen?: boolean;
}

/** Модальное окно на нативном <dialog>: фокус, Esc и затемнение «из коробки». */
export function Dialog({ open, onClose, title, children, footer, fullscreen }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={fullscreen ? styles.fullscreen : styles.dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className={styles.body}>
          <div className={styles.header}>
            {title && <h2 className={styles.title}>{title}</h2>}
            <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
              <X size={20} />
            </button>
          </div>
          <div className={styles.content}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Подтверждение необратимых действий: удаление аккаунта, отмена регистрации, отзыв прав. */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, loading, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={loading}>
            Отмена
          </button>
          <button
            type="button"
            className={danger ? styles.danger : styles.primary}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Подождите…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
