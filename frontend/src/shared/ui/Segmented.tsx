import clsx from 'clsx';
import styles from './Segmented.module.css';

export interface SegmentItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedProps<T extends string> {
  items: SegmentItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** «Организую · 2» вместо счётчика-бейджа. */
  countStyle?: 'badge' | 'dot';
  ariaLabel: string;
  className?: string;
}

/** Segmented control из UI-кита: вкладки списков, «Бесплатно / Платно». */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  countStyle = 'badge',
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={clsx(styles.root, className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx(styles.item, active && styles.active)}
            onClick={() => onChange(item.value)}
          >
            {item.label}
            {item.count !== undefined &&
              (countStyle === 'dot' ? (
                <span> · {item.count}</span>
              ) : (
                <span className={styles.count}>{item.count}</span>
              ))}
          </button>
        );
      })}
    </div>
  );
}
