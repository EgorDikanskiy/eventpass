import type { ChangeEvent, ReactNode } from 'react';
import type { Answer, Question } from '@/api';
import { Button, Checkbox, Field, Input, OptionCards, Textarea } from '@/shared/ui';
import styles from './RegistrationCard.module.css';

interface Props {
  question: Question;
  value: Answer;
  error?: string;
  onChange: (value: Answer) => void;
}

export function QuestionField({ question, value, error, onChange }: Props): ReactNode {
  const { label, type, placeholder, help, required } = question;
  const options = question.options ?? [];
  const textValue = typeof value === 'string' ? value : '';
  const selectedValues = Array.isArray(value) ? value : [];
  const isGroup = type === 'choice' || type === 'multiple';

  return (
    <Field label={<>{label}{required && <span aria-hidden> *</span>}</>} group={isGroup} hint={help} error={error}>
      {(id, describedBy) => {
        const common = { id, 'aria-describedby': describedBy, required };
        const text = {
          ...common,
          placeholder: placeholder ?? undefined,
          value: textValue,
          onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => onChange(event.target.value),
          invalid: !!error,
        };
        switch (type) {
          case 'choice':
            return (
              <>
                <OptionCards name={id} options={options} value={textValue} onChange={onChange} invalid={!!error}
                  labelledBy={id} describedBy={describedBy} />
                {!required && textValue && <Button variant="link" size="sm" onClick={() => onChange('')}>Снять выбор</Button>}
              </>
            );
          case 'multiple':
            return (
              <div className={styles.multiple} role="group" aria-labelledby={id} aria-describedby={describedBy}>
                {options.map((option) => (
                  <Checkbox key={option.value} checked={selectedValues.includes(option.value)}
                    onChange={(event) => onChange(event.target.checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((selected) => selected !== option.value))}>
                    <span>{option.label}{option.hint && <small className={styles.optionHint}>{option.hint}</small>}</span>
                  </Checkbox>
                ))}
              </div>
            );
          case 'select':
            return (
              <select {...common} className={styles.select} value={textValue} aria-invalid={!!error}
                onChange={(event) => onChange(event.target.value)}>
                <option value="">{placeholder || 'Выберите вариант'}</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}{option.hint && ` · ${option.hint}`}</option>
                ))}
              </select>
            );
          case 'textarea':
            return <Textarea {...text} rows={3} maxLength={4000} />;
          default:
            return <Input {...text} type={type} step={type === 'number' ? 'any' : undefined} maxLength={4000} />;
        }
      }}
    </Field>
  );
}
