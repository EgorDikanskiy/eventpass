import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import styles from './Button.module.css';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'md' | 'sm';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

function classes({ variant = 'primary', size = 'md', fullWidth, className }: CommonProps) {
  return clsx(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className);
}

function Content({ icon, iconRight, loading, children }: CommonProps) {
  return (
    <>
      {loading ? <Spinner size={16} /> : icon}
      {children && <span>{children}</span>}
      {!loading && iconRight}
    </>
  );
}

/** Кнопки из UI-кита: Primary / Secondary / Danger / Small (36) / Text link. */
export function Button(props: ButtonProps) {
  const { variant, size, fullWidth, icon, iconRight, loading, className, children, disabled, type = 'button', ...rest } =
    props;
  return (
    <button
      type={type}
      className={classes({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

type ButtonLinkProps = CommonProps & Omit<LinkProps, 'className' | 'children'>;

/** Ссылка, которая выглядит как кнопка (переходы между экранами). */
export function ButtonLink(props: ButtonLinkProps) {
  const { variant, size, fullWidth, icon, iconRight, className, children, ...rest } = props;
  return (
    <Link className={classes({ variant, size, fullWidth, className })} {...rest}>
      <Content icon={icon} iconRight={iconRight}>
        {children}
      </Content>
    </Link>
  );
}
