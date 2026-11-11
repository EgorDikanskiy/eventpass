import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './Form.module.css';

interface FieldProps {
  label?: ReactNode;
  /** Подсказка справа от подписи («Для отправки билета», «Мин. 8 символов»). */
  aside?: ReactNode;
  group?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Обёртка поля: подпись + контрол + подсказка/ошибка. */
export function Field({ label, aside, group, hint, error, className, children }: FieldProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;
  return (
    <div className={clsx(styles.field, className)}>
      {(label || aside) && (
        <div className={styles.labelRow}>
          {label && (group
            ? <span id={id} className={styles.label}>{label}</span>
            : <label htmlFor={id} className={styles.label}>{label}</label>)}
          {aside && <span className={styles.aside}>{aside}</span>}
        </div>
      )}
      {children(id, messageId)}
      {error ? (
        <p id={messageId} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Иконка или текст справа внутри поля («чел.», иконка карты). */
  suffix?: ReactNode;
  /** Иконка слева (лупа в поиске). `prefix` занят HTML-атрибутом, поэтому `leading`. */
  leading?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, suffix, leading, className, ...rest },
  ref,
) {
  return (
    <div className={clsx(styles.inputBox, invalid && styles.invalid, className)}>
      {leading && <span className={styles.affix}>{leading}</span>}
      <input ref={ref} className={styles.input} aria-invalid={invalid || undefined} {...rest} />
      {suffix && <span className={styles.affix}>{suffix}</span>}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'suffix'>>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        suffix={
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          >
            {visible ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        }
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx(styles.textarea, invalid && styles.invalid, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
  invalid?: boolean;
}

export function Checkbox({ children, invalid, className, ...rest }: CheckboxProps) {
  return (
    <label className={clsx(styles.checkbox, invalid && styles.checkboxInvalid, className)}>
      <input type="checkbox" {...rest} />
      <span>{children}</span>
    </label>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Переключатель (UI-кит → Toggle). */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx(styles.toggle, checked && styles.toggleOn)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string | null;
}

interface OptionCardsProps {
  labelledBy?: string;
  describedBy?: string;
  name: string;
  options: ChoiceOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  invalid?: boolean;
}

/** Option card из UI-кита: вопрос организатора «выбор из списка». */
export function OptionCards({ name, options, value, onChange, invalid, labelledBy, describedBy }: OptionCardsProps) {
  return (
    <div className={clsx(styles.options, invalid && styles.optionsInvalid)} role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      {options.map((option) => (
        <label key={option.value} className={clsx(styles.option, value === option.value && styles.optionActive)}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="visually-hidden"
          />
          <span className={styles.optionLabel}>{option.label}</span>
          {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
        </label>
      ))}
    </div>
  );
}
