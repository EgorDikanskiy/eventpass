import clsx from 'clsx';
import { Check, TriangleAlert, X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { initials } from '../lib/format';
import styles from './Display.module.css';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

/** Badge из UI-кита: метки, номера билетов, счётчики. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx(styles.badge, styles[`badge_${tone}`], className)}>{children}</span>;
}

/** Status dot: статус участника, билета, сканирования. */
export function StatusDot({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx(styles.status, className)}>
      <span className={clsx(styles.dot, styles[`dot_${tone}`])} aria-hidden />
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32, accent }: { name: string; size?: number; accent?: boolean }) {
  return (
    <span
      className={clsx(styles.avatar, accent && styles.avatarAccent)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx(styles.card, className)} {...rest} />;
}

/** Key-value row: «Время чекина ……… 10:14:02». */
export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.keyValue}>
      <span className={styles.keyValueLabel}>{label}</span>
      <span className={styles.keyValueValue}>{children}</span>
    </div>
  );
}

const RESULT_ICON = { success: Check, warning: TriangleAlert, danger: X } as const;

/** Result mark из UI-кита: итог сканирования, успех публикации. */
export function ResultMark({ tone, size = 72 }: { tone: 'success' | 'warning' | 'danger'; size?: number }) {
  const Icon = RESULT_ICON[tone];
  return (
    <span className={clsx(styles.resultMark, styles[`result_${tone}`])} style={{ width: size, height: size }}>
      <Icon size={size * 0.4} strokeWidth={2.4} />
    </span>
  );
}

/** Metric card: «Зарегистрировано 242 / 250» с прогрессом. */
export function MetricCard({
  label,
  value,
  suffix,
  progress,
  icon,
  barTone = 'accent',
}: {
  label: string;
  value: ReactNode;
  suffix?: ReactNode;
  progress?: number;
  icon?: ReactNode;
  barTone?: 'accent' | 'light' | 'muted';
}) {
  return (
    <Card className={styles.metric}>
      <div className={styles.metricHead}>
        <span>{label}</span>
        {icon}
      </div>
      <div className={styles.metricValue}>
        <strong>{value}</strong>
        {suffix && <span>{suffix}</span>}
      </div>
      {progress !== undefined && (
        <div className={styles.bar} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span className={clsx(styles.barFill, styles[`bar_${barTone}`])} style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}
    </Card>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Предупреждение / информационный блок (жёлтая плашка «У вас уже есть аккаунт»). */
export function Notice({
  tone = 'neutral',
  title,
  icon,
  children,
  className,
}: {
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(styles.notice, styles[`notice_${tone}`], className)} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <span className={styles.noticeIcon}>{icon}</span>}
      <div>
        {title && <p className={styles.noticeTitle}>{title}</p>}
        {children && <div className={styles.noticeText}>{children}</div>}
      </div>
    </div>
  );
}
