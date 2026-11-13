import clsx from 'clsx';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

type ToastTone = 'neutral' | 'success' | 'danger';

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

/** Короткие уведомления: «Ссылка скопирована», «Изменения сохранены». */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((text: string, tone: ToastTone = 'neutral') => {
    const id = Date.now() + Math.random();
    // Одинаковое уведомление, которое уже на экране, не дублируем
    // (например, при двойном вызове эффекта в StrictMode)
    setItems((list) => (list.some((item) => item.text === text) ? list : [...list, { id, text, tone }]));
    setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 3200);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={clsx(styles.toast, styles[item.tone])}>
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast должен использоваться внутри ToastProvider');
  return show;
}
