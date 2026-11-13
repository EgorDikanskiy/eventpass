import styles from './Spinner.module.css';

export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span className={styles.spinner} style={{ width: size, height: size }} role="status" aria-label={label ?? 'Загрузка'} />
  );
}

/** Заглушка на время загрузки экрана. */
export function PageLoader() {
  return (
    <div className={styles.page}>
      <Spinner size={28} />
    </div>
  );
}
