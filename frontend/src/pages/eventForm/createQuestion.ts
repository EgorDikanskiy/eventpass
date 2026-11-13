import { OPTION_QUESTION_TYPES, type Question, type QuestionOption, type QuestionType } from '@/api';

let nextId = 0;

export function createOption(label: string): QuestionOption {
  return { value: `option_${Date.now().toString(36)}_${nextId++}`, label };
}

export function createQuestion(type: QuestionType = 'text'): Question {
  return {
    id: `q_${Date.now().toString(36)}_${nextId++}`,
    label: '',
    type,
    required: false,
    options: OPTION_QUESTION_TYPES.includes(type) ? [createOption('Вариант 1'), createOption('Вариант 2')] : undefined,
  };
}
