import { OPTION_QUESTION_TYPES, type Answer, type Answers, type Question } from './types';

function validateAnswer(question: Question, answer: Answer): string | undefined {
  const { type, required } = question;
  const hasValue = typeof answer === 'string' ? !!answer.trim() : answer.length > 0;
  if (!hasValue) return required ? 'Обязательный вопрос' : undefined;

  if (type === 'multiple') {
    const values = new Set(question.options?.map((option) => option.value));
    if (!Array.isArray(answer) || new Set(answer).size !== answer.length || answer.some((item) => !values.has(item))) {
      return 'Выберите варианты из списка';
    }
    return undefined;
  }

  if (typeof answer !== 'string') return 'Введите один ответ';
  const value = answer.trim();
  if (OPTION_QUESTION_TYPES.includes(type) && !question.options?.some((option) => option.value === value)) {
    return 'Выберите вариант из списка';
  }
  if (type === 'email' && !/^\S+@\S+\.\S+$/.test(value)) return 'Проверьте email';
  if (type === 'tel' && (!/^\+?[0-9 ().-]+$/.test(value) || !/^\d{7,15}$/.test(value.replace(/\D/g, '')))) {
    return 'Введите номер телефона';
  }
  if (type === 'number' && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))) {
    return 'Введите число';
  }
  if (type === 'date') {
    const date = new Date(value + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') ||
        Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return 'Введите дату';
  }
}

export function validateQuestionAnswers(questions: Question[], answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const question of questions) {
    const error = validateAnswer(question, answers[question.id] ?? '');
    if (error) errors[question.id] = error;
  }
  return errors;
}

export function formatQuestionAnswer(question: Question, answer: Answer = ''): string {
  const labels = new Map(question.options?.map((option) => [option.value, option.label]));
  const values = Array.isArray(answer) ? answer : [answer];
  return values.map((value) => labels.get(value) ?? value).join(', ');
}
