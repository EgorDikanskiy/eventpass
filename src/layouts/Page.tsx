import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './Page.module.css';

/** Контейнер страницы: `wide` — 1280, по умолчанию — 896 (как в макетах кабинета). */
export function Page({ children, width = 'default', className }: { children: ReactNode; width?: 'default' | 'wide' | 'narrow'; className?: string }) {
  return <div className={clsx(styles.page, styles[width], className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.back}>
      <ArrowLeft size={14} />
      {children}
    </Link>
  );
}
