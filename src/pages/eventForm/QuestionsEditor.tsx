import { ArrowDown, ArrowUp, Mail, Phone, Plus, Trash2, UserRound, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { OPTION_QUESTION_TYPES, type Question, type QuestionOption, type QuestionType } from '@/api';
import { Badge, Button, Checkbox, Input } from '@/shared/ui';
import { createOption, createQuestion } from './createQuestion';
import styles from './EventFormPage.module.css';

const CONTACT_FIELDS = [
  { icon: UserRound, label: 'Имя и фамилия' },
  { icon: Mail, label: 'Электронная почта' },
  { icon: Phone, label: 'Телефон' },
];

const QUESTION_TYPES: Record<QuestionType, string> = {
  text: 'Короткий текст',
  textarea: 'Развёрнутый текст',
  email: 'Email',
  tel: 'Телефон',
  number: 'Число',
  date: 'Дата',
  choice: 'Один вариант',
  select: 'Выпадающий список',
  multiple: 'Несколько вариантов',
};
const MAX_QUESTIONS = 50;
const MAX_OPTIONS = 50;

interface OptionsProps {
  options: QuestionOption[];
  onChange: (options: QuestionOption[]) => void;
}

function OptionsEditor({ options, onChange }: OptionsProps): ReactNode {
  function update(value: string, patch: Partial<QuestionOption>): void {
    onChange(options.map((option) => option.value === value ? { ...option, ...patch } : option));
  }

  return (
    <div className={styles.options}>
      {options.map((option, index) => (
        <div key={option.value} className={styles.optionRow}>
          <Input aria-label={`Вариант ${index + 1}`} maxLength={300} value={option.label}
            onChange={(event) => update(option.value, { label: event.target.value })} />
          <Input aria-label={`Пояснение к варианту ${index + 1}`} maxLength={300}
            placeholder="Пояснение" value={option.hint ?? ''}
            onChange={(event) => update(option.value, { hint: event.target.value })} />
          <button type="button" className={styles.iconButton} disabled={options.length <= 2}
            onClick={() => onChange(options.filter((item) => item.value !== option.value))}
            aria-label={`Удалить вариант ${index + 1}`}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <Button variant="link" icon={<Plus size={16} />} disabled={options.length >= MAX_OPTIONS}
        onClick={() => onChange([...options, createOption(`Вариант ${options.length + 1}`)])}>
        Добавить вариант
      </Button>
    </div>
  );
}

interface Props {
  questions: Question[];
  onChange: (questions: Question[]) => void;
  errors: Record<string, string>;
}

export function QuestionsEditor({ questions, onChange, errors }: Props): ReactNode {
  function update(id: string, patch: Partial<Question>): void {
    onChange(questions.map((question) => question.id === id ? { ...question, ...patch } : question));
  }

  function changeType(question: Question, type: QuestionType): void {
    if (type === question.type) return;
    const options = OPTION_QUESTION_TYPES.includes(type)
      ? question.options ?? createQuestion(type).options
      : undefined;
    update(question.id, { type, options });
  }

  function moveQuestion(index: number, offset: number): void {
    const updated = [...questions];
    const [question] = updated.splice(index, 1);
    updated.splice(index + offset, 0, question);
    onChange(updated);
  }

  return (
    <div className={styles.questions}>
      <div className={styles.groupHead}>Контактные данные</div>
      {CONTACT_FIELDS.map(({ icon: Icon, label }) => (
        <div key={label} className={styles.baseField}>
          <Icon size={16} />
          <span>{label}</span>
          <Badge>Из профиля</Badge>
        </div>
      ))}

      <div className={styles.groupHead}>
        <span>Дополнительные вопросы</span>
        <span>{questions.length}</span>
      </div>

      {questions.map((question, index) => {
        const hasOptions = OPTION_QUESTION_TYPES.includes(question.type);
        const hasPlaceholder = !['choice', 'multiple', 'date'].includes(question.type);
        return (
          <div key={question.id} className={styles.question}>
            <div className={styles.questionRow}>
              <Input aria-label="Текст вопроса" placeholder="Введите вопрос" maxLength={300}
                value={question.label} onChange={(event) => update(question.id, { label: event.target.value })}
                invalid={!!errors[question.id]} className={styles.questionInput} />
              <button type="button" className={styles.iconButton} aria-label="Удалить вопрос"
                onClick={() => onChange(questions.filter((item) => item.id !== question.id))}>
                <X size={18} />
              </button>
            </div>
            {errors[question.id] && <p className={styles.error}>{errors[question.id]}</p>}

            <div className={styles.questionSettings}>
              <select className={styles.select} value={question.type} aria-label="Тип ответа"
                onChange={(event) => changeType(question, event.target.value as QuestionType)}>
                {Object.entries(QUESTION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Checkbox checked={question.required} onChange={(event) => update(question.id, { required: event.target.checked })}>
                Обязательный
              </Checkbox>
              {questions.length > 1 && (
                <div className={styles.orderButtons}>
                  <button type="button" className={styles.iconButton} disabled={index === 0}
                    aria-label={`Поднять вопрос ${index + 1}`} onClick={() => moveQuestion(index, -1)}>
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" className={styles.iconButton} disabled={index === questions.length - 1}
                    aria-label={`Опустить вопрос ${index + 1}`} onClick={() => moveQuestion(index, 1)}>
                    <ArrowDown size={16} />
                  </button>
                </div>
              )}
            </div>

            <Input aria-label="Подсказка к вопросу" placeholder="Подсказка под полем" maxLength={300}
              value={question.help ?? ''} onChange={(event) => update(question.id, { help: event.target.value })} />
            {hasPlaceholder && (
              <Input aria-label="Пример ответа" placeholder="Пример внутри поля" maxLength={300}
                value={question.placeholder ?? ''} onChange={(event) => update(question.id, { placeholder: event.target.value })} />
            )}
            {hasOptions && (
              <OptionsEditor options={question.options ?? []} onChange={(options) => update(question.id, { options })} />
            )}
          </div>
        );
      })}

      <button type="button" className={styles.addQuestion} disabled={questions.length >= MAX_QUESTIONS}
        onClick={() => onChange([...questions, createQuestion()])}>
        <Plus size={16} />
        Добавить вопрос
      </button>
    </div>
  );
}
